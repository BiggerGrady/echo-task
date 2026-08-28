import mammoth from "mammoth";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { chatCompletion, chatCompletionStream, type ChatMessage, isDemoMode } from "../llm";
import { buildReferenceContext } from "../references";
import { buildSkillContext } from "../skills";
import { injectCommentsIntoDocx } from "../documents/word-comments";
import {
  CHAT_HISTORY_MESSAGE_LIMIT,
  EXCEL_SNAPSHOT_JSON_LIMIT,
  WORD_TEXT_LIMIT,
} from "../constants";
import { OUTPUTS_DIR, UPLOADS_DIR } from "../paths";
import {
  addMessage,
  createSession,
  getSession,
  listRecentMessages,
  touchSession,
} from "./sessions";
import { completeJob, createJob } from "../jobs";
import { randomUUID } from "crypto";

export type ChatTaskType = "auto" | "word" | "excel" | "chat";

export type ChatEvent =
  | { event: "meta"; data: Record<string, unknown> }
  | { event: "status"; data: { stage: string; message: string } }
  | { event: "delta"; data: { text: string } }
  | { event: "result"; data: Record<string, unknown> }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: { ok: boolean } };

type GrammarIssue = {
  id: number;
  original: string;
  suggestion: string;
  reason: string;
  severity: "error" | "warning" | "info";
};

type PlannedOp =
  | { type: "filter"; sheet: string; column: string; op: "eq" | "neq" | "contains"; value: string }
  | { type: "sort"; sheet: string; column: string; direction: "asc" | "desc" }
  | { type: "rename_column"; sheet: string; from: string; to: string }
  | { type: "add_column"; sheet: string; name: string; formula: "copy" | "uppercase" | "trim"; source: string }
  | { type: "keep_columns"; sheet: string; columns: string[] }
  | { type: "note"; description: string };

function inferType(fileName?: string, explicit?: ChatTaskType): "word" | "excel" | "chat" {
  if (explicit && explicit !== "auto") {
    if (explicit === "word" || explicit === "excel" || explicit === "chat") return explicit;
  }
  const lower = (fileName || "").toLowerCase();
  if (lower.endsWith(".docx")) return "word";
  if (lower.endsWith(".xlsx")) return "excel";
  return "chat";
}

function parseIssues(raw: string): { summary: string; issues: GrammarIssue[]; parseOk: boolean } {
  try {
    const parsed = JSON.parse(raw) as { summary?: string; issues?: GrammarIssue[] };
    return {
      summary: parsed.summary ?? "校验完成",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      parseOk: true,
    };
  } catch {
    return { summary: raw.slice(0, 300), issues: [], parseOk: false };
  }
}

function parsePlan(raw: string): { summary: string; operations: PlannedOp[]; parseOk: boolean } {
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

async function readWorkbookSnapshot(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheets: Array<{ name: string; headers: string[]; rows: Record<string, string>[] }> = [];
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

function severityLabel(severity: GrammarIssue["severity"]) {
  if (severity === "error") return "错误";
  if (severity === "warning") return "警告";
  return "建议";
}

function buildHistoryMessages(sessionId: string): ChatMessage[] {
  const recent = listRecentMessages(sessionId, CHAT_HISTORY_MESSAGE_LIMIT);
  return recent
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

export async function* runChat(input: {
  sessionId?: string;
  message: string;
  type: ChatTaskType;
  model?: string;
  file?: { buffer: Buffer; name: string; storedName: string } | null;
  signal?: AbortSignal;
}): AsyncGenerator<ChatEvent> {
  const demo = isDemoMode();
  let session = input.sessionId ? getSession(input.sessionId) : null;
  if (!session) {
    const titleSeed = input.message.trim() || input.file?.name || "新对话";
    session = createSession(titleSeed.slice(0, 40));
  }

  const taskType = inferType(input.file?.name, input.type);
  const job =
    input.file && (taskType === "word" || taskType === "excel")
      ? createJob({
          type: taskType,
          originalName: input.file.name,
          inputFilename: input.file.storedName,
          instruction: input.message,
        })
      : null;

  yield {
    event: "meta",
    data: {
      sessionId: session.id,
      jobId: job?.id || null,
      type: taskType,
      model: input.model || null,
      demo,
    },
  };

  try {
    const userDisplay = [
      input.message.trim(),
      input.file ? `附件：${input.file.name}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    addMessage({
      sessionId: session.id,
      role: "user",
      content: userDisplay || "(附件处理)",
      attachments: input.file
        ? [{ name: input.file.name, storedName: input.file.storedName, type: taskType }]
        : [],
      meta: { type: taskType, model: input.model || null },
    });

    if (session.title === "新对话") {
      touchSession(session.id, (input.message || input.file?.name || "新对话").slice(0, 40));
    }

    const history = buildHistoryMessages(session.id);
    // history already includes the user message we just added; fine

    let assistantText = "";
    let resultPayload: Record<string, unknown> = {};

    if (taskType === "word" && input.file) {
      yield { event: "status", data: { stage: "extracting", message: "正在提取 Word 正文…" } };
      const extracted = await mammoth.extractRawText({ buffer: input.file.buffer });
      const fullText = extracted.value.trim();
      const truncated = fullText.length > WORD_TEXT_LIMIT;
      const text = fullText.slice(0, WORD_TEXT_LIMIT);
      const references = buildReferenceContext("word");
      const skills = buildSkillContext("word");

      yield {
        event: "status",
        data: {
          stage: "context",
          message: truncated
            ? `正文较长，已截断至 ${WORD_TEXT_LIMIT} 字后送模型`
            : "已加载参考文档与 Skill",
        },
      };

      const system: ChatMessage = {
        role: "system",
        content:
          "你是文档处理助手。先用中文简要说明你将如何校验这份 Word（不要输出 JSON）。结合参考文档与 Skill。",
      };
      const userCtx: ChatMessage = {
        role: "user",
        content: `用户说明：${input.message || "请校验语法并标注问题"}
文件名：${input.file.name}

## 参考文档
${references}

## Skill
${skills}

## 待校验正文
${text}`,
      };

      yield { event: "status", data: { stage: "streaming", message: "模型分析中…" } };
      for await (const chunk of chatCompletionStream([system, ...history.slice(0, -1), userCtx], {
        modelOverride: input.model,
        signal: input.signal,
      })) {
        if (chunk.text) {
          assistantText += chunk.text;
          yield { event: "delta", data: { text: chunk.text } };
        }
      }

      yield { event: "status", data: { stage: "structuring", message: "生成结构化校对结果…" } };
      const structured = await chatCompletion(
        [
          {
            role: "system",
            content: `你是校对专家，只返回 JSON：
{"summary":"总评","issues":[{"id":1,"original":"原文连续片段","suggestion":"建议","reason":"原因","severity":"error|warning|info"}]}`,
          },
          {
            role: "user",
            content: `用户说明：${input.message || "请校验"}
文件：${input.file.name}
## 参考文档
${references}
## Skill
${skills}
## 正文
${text}`,
          },
        ],
        { json: true, temperature: 0.1, modelOverride: input.model, signal: input.signal }
      );

      const { summary, issues, parseOk } = parseIssues(structured.content);
      if (!parseOk) {
        throw new Error("模型返回的校对结果不是合法 JSON，请重试");
      }

      yield { event: "status", data: { stage: "writing", message: "正在写入 Word 批注…" } };
      const comments = [
        ...issues.map((issue) => {
          const locate = (issue.original || "").trim();
          return {
            locate,
            body: [
              locate ? `【定位】${locate}` : "",
              `[${severityLabel(issue.severity)}] ${issue.reason || "需修订"}`,
              issue.suggestion ? `建议：${issue.suggestion}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          };
        }),
        { locate: "", body: `【总评】${summary}` },
      ].map((c, i) => ({
        id: i,
        body: c.body,
        author: "Echo Task",
        initials: "ET",
      }));

      const annotated = await injectCommentsIntoDocx(input.file.buffer, comments);
      const outputFilename = `${job!.id}-${path.basename(input.file.name, path.extname(input.file.name))}-批注.docx`;
      fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUTPUTS_DIR, outputFilename), annotated);

      completeJob(job!.id, {
        status: "succeeded",
        outputFilename,
        result: { summary, issues, demo, truncated, commentedCount: comments.length },
      });

      resultPayload = {
        summary,
        issues,
        truncated,
        demo,
        model: structured.model,
        downloadUrl: `/api/download/${encodeURIComponent(outputFilename)}?kind=output&jobId=${job!.id}`,
        jobId: job!.id,
        commentedCount: comments.length,
      };
      assistantText =
        (assistantText ? `${assistantText.trim()}\n\n` : "") +
        `已完成 Word 批注：${summary}`;
    } else if (taskType === "excel" && input.file) {
      if (!input.message.trim()) {
        throw new Error("处理 Excel 请填写自然语言指令");
      }
      yield { event: "status", data: { stage: "extracting", message: "正在读取 Excel…" } };
      const snapshot = await readWorkbookSnapshot(input.file.buffer);
      const snapshotJson = JSON.stringify(snapshot);
      const truncated = snapshotJson.length > EXCEL_SNAPSHOT_JSON_LIMIT;
      const snapshotPayload = snapshotJson.slice(0, EXCEL_SNAPSHOT_JSON_LIMIT);
      const references = buildReferenceContext("excel");
      const skills = buildSkillContext("excel");

      yield {
        event: "status",
        data: {
          stage: "context",
          message: truncated ? "表格快照较大，已截断后送模型" : "已加载参考文档与 Skill",
        },
      };

      const system: ChatMessage = {
        role: "system",
        content:
          "你是表格处理助手。先用中文说明处理思路与将执行的步骤（不要输出 JSON）。结合参考文档与 Skill。",
      };
      const userCtx: ChatMessage = {
        role: "user",
        content: `指令：${input.message}
文件：${input.file.name}
## 参考文档
${references}
## Skill
${skills}
## 表格快照
${snapshotPayload}`,
      };

      yield { event: "status", data: { stage: "streaming", message: "模型分析中…" } };
      for await (const chunk of chatCompletionStream([system, ...history.slice(0, -1), userCtx], {
        modelOverride: input.model,
        signal: input.signal,
      })) {
        if (chunk.text) {
          assistantText += chunk.text;
          yield { event: "delta", data: { text: chunk.text } };
        }
      }

      yield { event: "status", data: { stage: "structuring", message: "生成可执行处理计划…" } };
      const structured = await chatCompletion(
        [
          {
            role: "system",
            content: `你是 Excel 规划器，只返回 JSON：
{"summary":"...","operations":[{"type":"filter|sort|rename_column|add_column|keep_columns|note", "...":"..."}]}`,
          },
          {
            role: "user",
            content: `指令：${input.message}
文件：${input.file.name}
## 参考文档
${references}
## Skill
${skills}
## 表格快照
${snapshotPayload}`,
          },
        ],
        { json: true, temperature: 0.1, modelOverride: input.model, signal: input.signal }
      );

      const { summary, operations, parseOk } = parsePlan(structured.content);
      if (!parseOk) throw new Error("模型返回的处理计划不是合法 JSON，请重试");

      yield { event: "status", data: { stage: "writing", message: "正在生成处理后的 Excel…" } };
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(input.file.buffer as unknown as ExcelJS.Buffer);
      if (!demo) applyOperations(workbook, operations);
      else {
        const note = workbook.addWorksheet("Echo处理说明");
        note.getCell("A1").value = "演示模式";
        note.getCell("A2").value = summary;
        note.getCell("A3").value = input.message;
      }

      const outputFilename = `${job!.id}-excel-processed.xlsx`;
      fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
      await workbook.xlsx.writeFile(path.join(OUTPUTS_DIR, outputFilename));

      completeJob(job!.id, {
        status: "succeeded",
        outputFilename,
        result: { summary, operations, demo, truncated, sheetNames: snapshot.map((s) => s.name) },
      });

      resultPayload = {
        summary,
        operations,
        truncated,
        demo,
        model: structured.model,
        downloadUrl: `/api/download/${encodeURIComponent(outputFilename)}?kind=output&jobId=${job!.id}`,
        jobId: job!.id,
        sheetNames: snapshot.map((s) => s.name),
      };
      assistantText =
        (assistantText ? `${assistantText.trim()}\n\n` : "") + `已完成 Excel 处理：${summary}`;
    } else {
      // pure chat
      yield { event: "status", data: { stage: "streaming", message: "模型回复中…" } };
      const references = buildReferenceContext("global");
      const skills = buildSkillContext("global");
      const system: ChatMessage = {
        role: "system",
        content: `你是 Echo Task 助手，帮助用户处理 Word/Excel 相关问题。可结合参考文档与 Skill。\n## 参考文档\n${references}\n## Skill\n${skills}`,
      };
      for await (const chunk of chatCompletionStream([system, ...history], {
        modelOverride: input.model,
        signal: input.signal,
      })) {
        if (chunk.text) {
          assistantText += chunk.text;
          yield { event: "delta", data: { text: chunk.text } };
        }
      }
      resultPayload = { summary: assistantText.slice(0, 200), demo };
    }

    addMessage({
      sessionId: session.id,
      role: "assistant",
      content: assistantText || String(resultPayload.summary || ""),
      meta: resultPayload,
    });

    yield { event: "result", data: resultPayload };
    yield { event: "done", data: { ok: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "处理失败";
    if (job) completeJob(job.id, { status: "failed", error: message });
    addMessage({
      sessionId: session.id,
      role: "assistant",
      content: `处理失败：${message}`,
      meta: { error: message },
    });
    yield { event: "error", data: { message } };
    yield { event: "done", data: { ok: false } };
  }
}

export function saveUpload(buffer: Buffer, originalName: string) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const storedName = `${randomUUID()}-${path.basename(originalName)}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, storedName), buffer);
  return storedName;
}
