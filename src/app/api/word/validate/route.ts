import { NextRequest, NextResponse } from "next/server";
import { validateWordDocument } from "@/lib/documents/word";
import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "@/lib/paths";
import { randomUUID } from "crypto";
import { completeJob, createJob } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "请上传 Word 文件（.docx）" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "目前仅支持 .docx" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const saved = `${randomUUID()}-${file.name}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, saved), buffer);

  const job = createJob({
    type: "word",
    originalName: file.name,
    inputFilename: saved,
  });

  try {
    const result = await validateWordDocument(buffer, file.name);
    completeJob(job.id, {
      status: "succeeded",
      outputFilename: result.outputFilename,
      result: {
        summary: result.summary,
        issues: result.issues,
        demo: result.demo,
        model: result.model,
        commentedCount: result.commentedCount,
      },
    });
    return NextResponse.json({ ...result, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "校验失败";
    completeJob(job.id, { status: "failed", error: message });
    return NextResponse.json({ error: message, jobId: job.id }, { status: 500 });
  }
}
