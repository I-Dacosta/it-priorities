import { NextResponse } from "next/server";
import { getCurrentAllowedUser } from "@/lib/auth-guard";
import { startLogin } from "@/lib/codex/manager";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentAllowedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const login = await startLogin(user.id);
    return NextResponse.json(login, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't start Codex sign-in." },
      { status: 502 }
    );
  }
}
