import { NextResponse } from "next/server";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { BridgeNotConfiguredError, startLogin } from "@/lib/codex/bridge-client";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await startLogin(user.id), { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't start Codex sign-in." },
      { status: error instanceof BridgeNotConfiguredError ? 503 : 502 }
    );
  }
}
