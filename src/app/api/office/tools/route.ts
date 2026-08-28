import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/auth";
import { OUTPUTS_DIR, UPLOADS_DIR } from "@/lib/paths";
import {
  applyExcelOperations,
  checkCompliance,
  extractDocxText,
  ingestComplianceSource,
  outlinePptx,
  parsePptOutline,
  readWorkbookSnapshot,
  renderPptx,
  writeCommentedDocx,
  type PlannedOp,
  type PptOutline,
} from "@/lib/office";

export const runtime = "nodejs";

/**
 * Thin tool surface for DeepSeek Harness plugins (and local scripts).
 * Same implementations as Echo Chat / office-core.
 */
export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const body = (await req.json()) as {
    tool?: string;
    inputFilename?: string;
    text?: string;
    url?: string;
    note?: string;
    fileName?: string;
    instruction?: string;
    summary?: string;
    issues?: Parameters<typeof writeCommentedDocx>[1];
    operations?: PlannedOp[];
    outputBasename?: string;
    outline?: PptOutline | string;
  };

  const tool = body.tool || "";

  try {
    if (tool === "ingest_compliance") {
      const draft = await ingestComplianceSource({
        text: body.text,
        url: body.url,
        note: body.note,
      });
      return NextResponse.json({ ok: true, tool, result: draft });
    }

    if (tool === "extract_docx_text") {
      const buffer = readUpload(body.inputFilename);
      const text = await extractDocxText(buffer);
      return NextResponse.json({ ok: true, tool, result: { text, chars: text.length } });
    }

    if (tool === "read_xlsx_snapshot") {
      const buffer = readUpload(body.inputFilename);
      const sheets = await readWorkbookSnapshot(buffer);
      return NextResponse.json({ ok: true, tool, result: { sheets } });
    }

    if (tool === "compliance_check") {
      const text =
        body.text ||
        (body.inputFilename ? await extractDocxText(readUpload(body.inputFilename)) : "");
      if (!text) throw new Error("需要 text 或 inputFilename");
      const result = await checkCompliance({
        text,
        fileName: body.fileName || body.inputFilename || "document.docx",
        instruction: body.instruction,
      });
      return NextResponse.json({ ok: true, tool, result });
    }

    if (tool === "add_word_comments") {
      const buffer = readUpload(body.inputFilename);
      const { annotated, commentedCount } = await writeCommentedDocx(
        buffer,
        body.issues || [],
        body.summary || "处理完成"
      );
      const outName = body.outputBasename || `office-${Date.now()}-批注.docx`;
      fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUTPUTS_DIR, path.basename(outName)), annotated);
      return NextResponse.json({
        ok: true,
        tool,
        result: { outputFilename: path.basename(outName), commentedCount },
      });
    }

    if (tool === "apply_excel_ops") {
      const buffer = readUpload(body.inputFilename);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      applyExcelOperations(workbook, body.operations || []);
      const outName = body.outputBasename || `office-${Date.now()}-excel.xlsx`;
      fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
      await workbook.xlsx.writeFile(path.join(OUTPUTS_DIR, path.basename(outName)));
      return NextResponse.json({
        ok: true,
        tool,
        result: { outputFilename: path.basename(outName) },
      });
    }

    if (tool === "outline_pptx") {
      let sourceText = body.text || "";
      if (!sourceText && body.inputFilename) {
        const buffer = readUpload(body.inputFilename);
        const name = (body.fileName || body.inputFilename).toLowerCase();
        if (name.endsWith(".xlsx")) {
          sourceText = JSON.stringify(await readWorkbookSnapshot(buffer)).slice(0, 12000);
        } else {
          sourceText = await extractDocxText(buffer);
        }
      }
      const result = await outlinePptx({
        instruction: body.instruction || body.note || "",
        sourceText,
      });
      return NextResponse.json({ ok: true, tool, result });
    }

    if (tool === "render_pptx") {
      if (body.outline == null) throw new Error("需要 outline");
      const raw = typeof body.outline === "string" ? body.outline : JSON.stringify(body.outline);
      const parsed = parsePptOutline(raw);
      const buffer = await renderPptx(parsed.outline);
      const outName = body.outputBasename || `office-${Date.now()}-deck.pptx`;
      const safeName = path.basename(outName).replace(/\.pptx$/i, "") + ".pptx";
      fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUTPUTS_DIR, safeName), buffer);
      return NextResponse.json({
        ok: true,
        tool,
        result: {
          outputFilename: safeName,
          title: parsed.outline.title,
          slideCount: parsed.outline.slides.length,
          parseOk: parsed.parseOk,
        },
      });
    }

    return NextResponse.json(
      {
        error: "未知 tool",
        tools: [
          "ingest_compliance",
          "extract_docx_text",
          "read_xlsx_snapshot",
          "compliance_check",
          "add_word_comments",
          "apply_excel_ops",
          "outline_pptx",
          "render_pptx",
        ],
      },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "工具执行失败";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

function readUpload(inputFilename?: string) {
  if (!inputFilename) throw new Error("缺少 inputFilename");
  const safe = path.basename(inputFilename);
  const filePath = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(filePath)) throw new Error("上传文件不存在");
  return fs.readFileSync(filePath);
}
