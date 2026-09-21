import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  CodexNotConfiguredError,
  CodexNotConnectedError,
  inferStream,
  type CodexStreamEvent,
} from "@/lib/codex/sandbox-client";

export const runtime = "nodejs";
// A Codex turn can legitimately think for a couple of minutes; the driver caps
// itself at four, so give the function room to deliver that.
export const maxDuration = 300;

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
});

async function buildBoardContext() {
  const tasks = await prisma.task.findMany({
    orderBy: [{ owner: "asc" }, { position: "asc" }],
    select: { title: true, notes: true, owner: true },
  });
  if (tasks.length === 0) return undefined;

  const lines = tasks.map((t) => `- [${t.owner}] ${t.title}${t.notes ? ` — ${t.notes}` : ""}`);
  return `Current IT priorities board:\n${lines.join("\n")}`;
}

export async function POST(request: Request) {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const iterator = inferStream({
    userId: user.id,
    model: user.preferredCodexModel?.trim() || "gpt-5-codex",
    messages: parsed.data.messages,
    boardContext: await buildBoardContext(),
    signal: request.signal,
  });

  // Pull the first event before committing to a streaming response, so setup
  // failures (no sandbox access, subscription not connected) come back as a
  // status code the client can act on rather than an error buried in the body.
  let first: IteratorResult<CodexStreamEvent>;
  try {
    first = await iterator.next();
  } catch (error) {
    if (error instanceof CodexNotConnectedError) {
      await prisma.allowedUser
        .update({ where: { id: user.id }, data: { codexConnectedAt: null } })
        .catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The assistant couldn't respond." },
      { status: error instanceof CodexNotConfiguredError ? 503 : 502 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: CodexStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        let result = first;
        while (!result.done) {
          const event = result.value;
          if (event.type === "error" && event.code === "reauth") {
            // The sandbox lost the credential; clear the cached flag so the UI
            // prompts for a reconnect instead of silently failing again.
            await prisma.allowedUser
              .update({ where: { id: user.id }, data: { codexConnectedAt: null } })
              .catch(() => {});
          }
          send(event);
          result = await iterator.next();
        }
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "The assistant couldn't respond.",
        });
      } finally {
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
