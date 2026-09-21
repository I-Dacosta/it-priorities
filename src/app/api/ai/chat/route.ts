import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { invoke, isConnected, ReauthenticationRequiredError } from "@/lib/codex/manager";

export const runtime = "nodejs";

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

  if (!isConnected(user.id)) {
    return NextResponse.json(
      { error: "Connect your Codex subscription in Settings → Assistant first." },
      { status: 409 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const boardContext = await buildBoardContext();
  const model = user.preferredCodexModel?.trim() || "gpt-5-codex";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
      };
      try {
        await invoke({
          userId: user.id,
          model,
          messages: parsed.data.messages,
          boardContext,
          signal: request.signal,
          onDelta: (delta) => send({ type: "delta", text: delta }),
        });
      } catch (error) {
        if (error instanceof ReauthenticationRequiredError) {
          send({ type: "error", message: error.message, code: "reauthentication_required" });
        } else {
          send({
            type: "error",
            message: error instanceof Error ? error.message : "The assistant couldn't respond.",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
