import { NextRequest, NextResponse } from "next/server";
import { deleteJob, listJobs, type JobType } from "@/lib/jobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") as JobType | null;
  const items = listJobs(type === "word" || type === "excel" || type === "pptx" ? type : undefined);
  return NextResponse.json({ items });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const ok = deleteJob(id);
  if (!ok) return NextResponse.json({ error: "未找到" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
