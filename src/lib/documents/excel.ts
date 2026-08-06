import ExcelJS from "exceljs";
import { chatCompletion } from "../llm";
import { buildReferenceContext } from "../references";
import { buildSkillContext } from "../skills";
import fs from "fs";
import path from "path";
import { OUTPUTS_DIR } from "../paths";
import { randomUUID } from "crypto";

export type ExcelProcessResult = {
  jobId: string;
  summary: string;
  outputFilename: string;
  demo: boolean;
  model: string;
  sheetNames: string[];
  preview: Record<string, string>[];
};

type SheetSnapshot = {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
};

async function readWorkbookSnapshot(buffer: Buffer): Promise<SheetSnapshot[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings accept Buffer-like
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheets: SheetSnapshot[] = [];

  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as Array<string | number | boolean | Date | null | undefined>;
      const cells = values.slice(1).map((v) => {
        if (v == null) return "";
        if (v instanceof Date) return v.toISOString();
        return String(v);
      });
      rows.push(cells);
    });
    if (!rows.length) {
      sheets.push({ name: sheet.name, headers: [], rows: [] });
      return;
    }
    const headers = rows[0].map((h, i) => h || `列${i + 1}`);
    const dataRows = rows.slice(1, 31).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });
    sheets.push({ name: sheet.name, headers, rows: dataRows });
  });

  return sheets;
}

type PlannedOp =
  | { type: "filter"; sheet: string; column: string; op: "eq" | "neq" | "contains"; value: string }
  | { type: "sort"; sheet: string; column: string; direction: "asc" | "desc" }
  | { type: "rename_column"; sheet: string; from: string; to: string }
  | { type: "add_column"; sheet: string; name: string; formula: "copy" | "uppercase" | "trim"; source: string }
  | { type: "keep_columns"; sheet: string; columns: string[] }
  | { type: "note"; description: string };

function parsePlan(raw: string): { summary: string; operations: PlannedOp[] } {
  try {
    const parsed = JSON.parse(raw) as { summary?: string; operations?: PlannedOp[] };
    return {
      summary: parsed.summary ?? "处理完成",
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
    };
  } catch {
    return { summary: raw.slice(0, 300), operations: [] };
  }
}

function applyOperations(workbook: ExcelJS.Workbook, operations: PlannedOp[]) {
  for (const op of operations) {
    if (op.type === "note") continue;
    const sheet = workbook.getWorksheet(op.sheet) ?? workbook.worksheets[0];
    if (!sheet) continue;

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? `列${col}`);
    });

    if (op.type === "rename_column") {
      const idx = headers.findIndex((h) => h === op.from);
      if (idx >= 0) headerRow.getCell(idx + 1).value = op.to;
      continue;
    }

    if (op.type === "add_column") {
      const sourceIdx = headers.findIndex((h) => h === op.source);
      const newCol = headers.length + 1;
      headerRow.getCell(newCol).value = op.name;
      if (sourceIdx >= 0) {
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return;
          const raw = String(row.getCell(sourceIdx + 1).value ?? "");
          let next = raw;
          if (op.formula === "uppercase") next = raw.toUpperCase();
          if (op.formula === "trim") next = raw.trim();
          row.getCell(newCol).value = next;
        });
      }
      continue;
    }

    if (op.type === "keep_columns") {
      const keep = new Set(op.columns);
      const removeIdx: number[] = [];
      headers.forEach((h, i) => {
        if (!keep.has(h)) removeIdx.push(i + 1);
      });
      removeIdx.reverse().forEach((col) => sheet.spliceColumns(col, 1));
      continue;
    }

    if (op.type === "filter") {
      const colIdx = headers.findIndex((h) => h === op.column) + 1;
      if (colIdx <= 0) continue;
      const toDelete: number[] = [];
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const val = String(row.getCell(colIdx).value ?? "");
        let keep = true;
        if (op.op === "eq") keep = val === op.value;
        if (op.op === "neq") keep = val !== op.value;
        if (op.op === "contains") keep = val.includes(op.value);
        if (!keep) toDelete.push(rowNumber);
      });
      toDelete.reverse().forEach((n) => sheet.spliceRows(n, 1));
      continue;
    }

    if (op.type === "sort") {
      const colIdx = headers.findIndex((h) => h === op.column);
      if (colIdx < 0) continue;
      const data: ExcelJS.CellValue[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const values: ExcelJS.CellValue[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          values[colNumber - 1] = cell.value;
        });
        data.push(values);
      });
      data.sort((a, b) => {
        const av = String(a[colIdx] ?? "");
        const bv = String(b[colIdx] ?? "");
        return op.direction === "asc" ? av.localeCompare(bv, "zh") : bv.localeCompare(av, "zh");
      });
      // clear data rows then rewrite
      while (sheet.rowCount > 1) sheet.spliceRows(2, 1);
      data.forEach((vals, i) => {
        const row = sheet.getRow(i + 2);
        vals.forEach((v, c) => {
          row.getCell(c + 1).value = v;
        });
        row.commit();
      });
    }
  }
}

export async function processExcelWithInstruction(
  fileBuffer: Buffer,
  originalName: string,
  instruction: string
): Promise<ExcelProcessResult> {
  const snapshot = await readWorkbookSnapshot(fileBuffer);
  const references = buildReferenceContext("excel");
  const skills = buildSkillContext("excel");

  const llm = await chatCompletion(
    [
      {
        role: "system",
        content: `你是 Excel 数据处理规划器。根据用户自然语言与表格快照，输出可执行 JSON 计划：
{"summary":"...","operations":[
  {"type":"filter","sheet":"Sheet1","column":"状态","op":"eq|neq|contains","value":"..."},
  {"type":"sort","sheet":"Sheet1","column":"日期","direction":"asc|desc"},
  {"type":"rename_column","sheet":"Sheet1","from":"旧","to":"新"},
  {"type":"add_column","sheet":"Sheet1","name":"新列","formula":"copy|uppercase|trim","source":"源列"},
  {"type":"keep_columns","sheet":"Sheet1","columns":["A","B"]},
  {"type":"note","description":"..."}
]}
只返回 JSON。优先使用存在的列名与工作表名。`,
      },
      {
        role: "user",
        content: `文件：${originalName}
指令：${instruction}

## 参考文档
${references}

## Skill 配置
${skills}

## 表格快照
${JSON.stringify(snapshot).slice(0, 30000)}`,
      },
    ],
    { json: true, temperature: 0.1 }
  );

  const { summary, operations } = parsePlan(llm.content);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

  if (!llm.demo) {
    applyOperations(workbook, operations);
  } else {
    // demo: append a note sheet so the download still changes
    const note = workbook.addWorksheet("Echo处理说明");
    note.getCell("A1").value = "演示模式";
    note.getCell("A2").value = summary;
    note.getCell("A3").value = instruction;
  }

  const jobId = randomUUID();
  const outputFilename = `${jobId}-excel-processed.xlsx`;
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  await workbook.xlsx.writeFile(path.join(OUTPUTS_DIR, outputFilename));

  return {
    jobId,
    summary,
    outputFilename,
    demo: llm.demo,
    model: llm.model,
    sheetNames: snapshot.map((s) => s.name),
    preview: snapshot[0]?.rows.slice(0, 5) ?? [],
  };
}
