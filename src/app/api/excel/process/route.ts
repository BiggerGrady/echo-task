import { NextRequest, NextResponse } from "next/server";
import { processExcelWithInstruction } from "@/lib/documents/excel";
import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "@/lib/paths";
import { randomUUID } from "crypto";
import { completeJob, createJob } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const instruction = String(form.get("instruction") || "").trim();

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "请上传 Excel 文件（.xlsx）" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "目前仅支持 .xlsx" }, { status: 400 });
  }
  if (!instruction) {
    return NextResponse.json({ error: "请填写自然语言处理指令" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const saved = `${randomUUID()}-${file.name}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, saved), buffer);

  const job = createJob({
    type: "excel",
    originalName: file.name,
    inputFilename: saved,
    instruction,
  });

  try {
    const result = await processExcelWithInstruction(buffer, file.name, instruction);
    completeJob(job.id, {
      status: "succeeded",
      outputFilename: result.outputFilename,
      result: {
        summary: result.summary,
        demo: result.demo,
        model: result.model,
        sheetNames: result.sheetNames,
      },
    });
    return NextResponse.json({ ...result, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "处理失败";
    completeJob(job.id, { status: "failed", error: message });
    return NextResponse.json({ error: message, jobId: job.id }, { status: 500 });
  }
}
