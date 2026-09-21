import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { BridgeNotConfiguredError, inferStream } from "@/lib/codex/bridge-client";

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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const upstream = await inferStream(
      {
        userId: user.id,
        model: user.preferredCodexModel?.trim() || "gpt-5-codex",
        messages: parsed.data.messages,
        boardContext: await buildBoardContext(),
      },
      request.signal
    );

    if (!upstream.ok || !upstream.body) {
      const detail = (await upstream.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { error: detail?.error ?? "The assistant couldn't respond." },
        { status: upstream.status === 409 ? 409 : 502 }
      );
    }

    // The bridge already speaks the NDJSON delta format the client expects.
    return new Response(upstream.body, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The assistant couldn't respond." },
      { status: error instanceof BridgeNotConfiguredError ? 503 : 502 }
    );
  }
}
