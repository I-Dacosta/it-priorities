import { NextResponse } from "next/server";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { disconnect, isBridgeConfigured, isConnected } from "@/lib/codex/bridge-client";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isBridgeConfigured()) {
    return NextResponse.json({ connected: false, configured: false });
  }

  try {
    return NextResponse.json({ connected: await isConnected(user.id), configured: true });
  } catch {
    // The bridge is configured but unreachable — report it as not connected
    // rather than failing the page, and let the connect attempt surface why.
    return NextResponse.json({ connected: false, configured: true, reachable: false });
  }
}

export async function DELETE() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await disconnect(user.id);
    return NextResponse.json({ connected: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't disconnect." },
      { status: 502 }
    );
  }
}
