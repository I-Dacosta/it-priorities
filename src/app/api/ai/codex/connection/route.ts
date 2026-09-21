import { NextResponse } from "next/server";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { disconnect, isCodexConfigured } from "@/lib/codex/sandbox-client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Answered from the cached flag rather than by resuming the user's sandbox:
  // this is read on every visit to the assistant, and waking a microVM to
  // render a status dot would be slow and billable. The sandbox stays the
  // source of truth — a stale flag surfaces as a "reconnect" prompt on the
  // next actual turn.
  return NextResponse.json({
    connected: Boolean(user.codexConnectedAt),
    configured: isCodexConfigured(),
  });
}

export async function DELETE() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await disconnect(user.id);
    await prisma.allowedUser.update({
      where: { id: user.id },
      data: { codexConnectedAt: null },
    });
    return NextResponse.json({ connected: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't disconnect." },
      { status: 502 }
    );
  }
}
