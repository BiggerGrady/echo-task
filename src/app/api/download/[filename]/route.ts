import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OUTPUTS_DIR, UPLOADS_DIR } from "@/lib/paths";
import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ filename: string }> };

function contentTypeFor(ext: string) {
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { filename } = await ctx.params;
  const safe = path.basename(filename);
  const kind = req.nextUrl.searchParams.get("kind"); // input | output | auto
  const jobId = req.nextUrl.searchParams.get("jobId");

  let filePath: string | null = null;
  let downloadName = safe;

  if (jobId) {
    const job = getJob(jobId);
    if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    if (kind === "input" && job.inputFilename) {
      filePath = path.join(UPLOADS_DIR, path.basename(job.inputFilename));
      downloadName = job.originalName || path.basename(job.inputFilename);
    } else if (job.outputFilename) {
      filePath = path.join(OUTPUTS_DIR, path.basename(job.outputFilename));
      downloadName = path.basename(job.outputFilename);
    }
  } else {
    const inOutputs = path.join(OUTPUTS_DIR, safe);
    const inUploads = path.join(UPLOADS_DIR, safe);
    if (kind === "input" && fs.existsSync(inUploads)) filePath = inUploads;
    else if (fs.existsSync(inOutputs)) filePath = inOutputs;
    else if (fs.existsSync(inUploads)) filePath = inUploads;
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
