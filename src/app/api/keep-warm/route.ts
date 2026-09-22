import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Keeps the Neon compute awake during working hours.
 *
 * Neon's Free plan suspends an idle compute after 5 minutes and the timeout
 * can't be disabled (only Launch and Scale can), so the first request each
 * morning — or after any quiet spell — pays a wake penalty on top of the
 * function cold start. A cheap query every few minutes keeps it up.
 *
 * Scheduled in vercel.json for weekday business hours only. Running it around
 * the clock would cost roughly 182 of the plan's 100 monthly CU-hours at the
 * 0.25 CU minimum, so it is deliberately not always on.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    // Vercel Cron sends this header automatically once CRON_SECRET is set.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Database unreachable." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, dbMs: Date.now() - startedAt });
}
