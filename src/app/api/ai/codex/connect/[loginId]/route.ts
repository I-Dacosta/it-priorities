import { NextResponse } from "next/server";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { pollLogin } from "@/lib/codex/bridge-client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ loginId: string }> }
) {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { loginId } = await params;
  try {
    return NextResponse.json(await pollLogin(loginId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't check the sign-in status." },
      { status: 502 }
    );
  }
}
