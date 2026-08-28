import ExcelJS from "exceljs";
import type { PlannedOp, SheetSnapshot } from "./types";

export async function readWorkbookSnapshot(buffer: Buffer): Promise<SheetSnapshot[]> {
  const workbook = new ExcelJS.Workbook();
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

export function applyExcelOperations(workbook: ExcelJS.Workbook, operations: PlannedOp[]) {
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

export function parseExcelPlan(raw: string): { summary: string; operations: PlannedOp[]; parseOk: boolean } {
  try {
    const parsed = JSON.parse(raw) as { summary?: string; operations?: PlannedOp[] };
    return {
      summary: parsed.summary ?? "处理完成",
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      parseOk: true,
    };
  } catch {
    return { summary: raw.slice(0, 300), operations: [], parseOk: false };
  }
}
