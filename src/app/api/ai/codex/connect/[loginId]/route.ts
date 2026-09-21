import { NextResponse } from "next/server";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { pollLogin } from "@/lib/codex/manager";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ loginId: string }> }
) {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { loginId } = await params;
  const result = await pollLogin(loginId);
  return NextResponse.json(result);
}
