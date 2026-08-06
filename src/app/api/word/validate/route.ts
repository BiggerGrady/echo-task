import { NextRequest, NextResponse } from "next/server";
import { validateWordDocument } from "@/lib/documents/word";
import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "@/lib/paths";
import { randomUUID } from "crypto";

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

  try {
    const result = await validateWordDocument(buffer, file.name);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "校验失败" },
      { status: 500 }
    );
  }
}
