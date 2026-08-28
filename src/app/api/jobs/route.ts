import { NextRequest, NextResponse } from "next/server";
import { listJobsPage, type JobType } from "@/lib/jobs";
import { HISTORY_PAGE_SIZE } from "@/lib/constants";

export const runtime = "nodejs";

const JOB_TYPES: JobType[] = ["word", "excel", "pptx", "report", "analyze"];

export async function GET(req: NextRequest) {
  const typeRaw = req.nextUrl.searchParams.get("type") as JobType | null;
  const type = typeRaw && JOB_TYPES.includes(typeRaw) ? typeRaw : undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || HISTORY_PAGE_SIZE);
  const offset = Number(req.nextUrl.searchParams.get("offset") || 0);
  const page = listJobsPage({ type, limit, offset });
  return NextResponse.json(page);
}
