import { NextResponse } from "next/server";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { disconnect, isConnected } from "@/lib/codex/manager";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ connected: isConnected(user.id) });
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
