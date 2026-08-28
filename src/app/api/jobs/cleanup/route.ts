import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { cleanupOldJobs } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let olderThanDays = 30;
  try {
    const body = (await req.json()) as { olderThanDays?: number };
    if (typeof body.olderThanDays === "number" && body.olderThanDays >= 1) {
      olderThanDays = Math.min(365, Math.floor(body.olderThanDays));
    }
  } catch {
    // default 30
  }
  const result = cleanupOldJobs(olderThanDays);
  return NextResponse.json({ ok: true, olderThanDays, ...result });
}
