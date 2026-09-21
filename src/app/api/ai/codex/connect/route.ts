import { NextResponse } from "next/server";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  CodexNotConfiguredError,
  getLoginStatus,
  startLogin,
} from "@/lib/codex/sandbox-client";

export const runtime = "nodejs";
// Preparing a first-time sandbox installs the codex CLI, so allow well past
// the default before giving up.
export const maxDuration = 120;

function errorResponse(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: error instanceof CodexNotConfiguredError ? 503 : 502 }
  );
}

/** Kicks off the device-code login; the code itself arrives via GET. */
export async function POST() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await startLogin(user.id);
    return NextResponse.json({ started: true }, { status: 202 });
  } catch (error) {
    return errorResponse(error, "Couldn't start Codex sign-in.");
  }
}

/** Polled while the dialog is open: preparing → pending (code) → connected/failed. */
export async function GET() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = await getLoginStatus(user.id);
    if (status.status === "connected") {
      await prisma.allowedUser.update({
        where: { id: user.id },
        data: { codexConnectedAt: new Date() },
      });
    }
    return NextResponse.json(status);
  } catch (error) {
    return errorResponse(error, "Couldn't check the sign-in status.");
  }
}
