import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OUTPUTS_DIR, UPLOADS_DIR } from "@/lib/paths";
import { getJob } from "@/lib/jobs";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ filename: string }> };

function contentTypeFor(ext: string) {
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (ext === ".pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const { filename } = await ctx.params;
  const safe = path.basename(filename);
  const kind = req.nextUrl.searchParams.get("kind") || "output";
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json(
      { error: "下载需要 jobId 参数，禁止裸文件名访问" },
      { status: 400 }
    );
  }

  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  let filePath: string | null = null;
  let downloadName = safe;

  if (kind === "input") {
    if (!job.inputFilename) {
      return NextResponse.json({ error: "原文不存在" }, { status: 404 });
    }
    const stored = path.basename(job.inputFilename);
    if (safe !== stored) {
      return NextResponse.json({ error: "文件与任务不匹配" }, { status: 403 });
    }
    filePath = path.join(UPLOADS_DIR, stored);
    downloadName = job.originalName || stored;
  } else {
    if (!job.outputFilename) {
      return NextResponse.json({ error: "结果文件不存在" }, { status: 404 });
    }
    const stored = path.basename(job.outputFilename);
    if (safe !== stored) {
      return NextResponse.json({ error: "文件与任务不匹配" }, { status: 403 });
    }
    filePath = path.join(OUTPUTS_DIR, stored);
    downloadName = stored;
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentTypeFor(ext),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    },
  });
}
