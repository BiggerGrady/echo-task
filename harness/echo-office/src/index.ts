/**
 * DeepSeek Harness plugin (developer preview).
 * Registers office tools that call Echo Task POST /api/office/tools
 * so Word/Excel/compliance stay a single implementation.
 *
 * Load: pnpm dsh web --patch <abs>/harness/echo-office/cordis.patch.yml
 * Requires Echo running at ECHO_TASK_URL (default http://127.0.0.1:3000).
 *
 * `defineTool` API may change with dsh versions; keep execute() bodies stable.
 */

type Ctx = {
  tools: {
    register: (tool: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (args: Record<string, unknown>) => Promise<unknown>;
    }) => void;
  };
};

const ECHO = (process.env.ECHO_TASK_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const ACCESS = process.env.ECHO_ACCESS_PASSWORD || process.env.ACCESS_PASSWORD || "";

async function callEcho(tool: string, payload: Record<string, unknown>) {
  const res = await fetch(`${ECHO}/api/office/tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ACCESS ? { "x-echo-access": ACCESS } : {}),
    },
    body: JSON.stringify({ tool, ...payload }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; result?: unknown };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Echo tool ${tool} failed (${res.status})`);
  }
  return data.result;
}

export const name = "echo-office";
export const inject = ["tools"];

export function apply(ctx: Ctx) {
  ctx.tools.register({
    name: "ingest_compliance",
    description: "从粘贴文案或 URL 整理合规 Skill 草稿（不自动启用）。",
    parameters: {
      text: { type: "string", description: "规范原文" },
      url: { type: "string", description: "规范链接" },
      note: { type: "string", description: "适用范围等补充" },
    },
    execute: (args) => callEcho("ingest_compliance", args),
  });

  ctx.tools.register({
    name: "extract_docx_text",
    description: "读取 Echo uploads 中的 docx 正文。",
    parameters: {
      inputFilename: { type: "string", required: true, description: "uploads 内存储文件名" },
    },
    execute: (args) => callEcho("extract_docx_text", args),
  });

  ctx.tools.register({
    name: "compliance_check",
    description: "按已启用合规 Skill 检查正文或 uploads 中的 docx。",
    parameters: {
      text: { type: "string" },
      inputFilename: { type: "string" },
      fileName: { type: "string" },
      instruction: { type: "string" },
    },
    execute: (args) => callEcho("compliance_check", args),
  });

  ctx.tools.register({
    name: "add_word_comments",
    description: "把 issues 写入 Word 批注并保存到 Echo outputs。",
    parameters: {
      inputFilename: { type: "string", required: true },
      summary: { type: "string" },
      issues: { type: "array" },
      outputBasename: { type: "string" },
    },
    execute: (args) => callEcho("add_word_comments", args),
  });

  ctx.tools.register({
    name: "read_xlsx_snapshot",
    description: "读取 Excel 表头与前若干行快照。",
    parameters: {
      inputFilename: { type: "string", required: true },
    },
    execute: (args) => callEcho("read_xlsx_snapshot", args),
  });

  ctx.tools.register({
    name: "apply_excel_ops",
    description: "对 uploads 中的 xlsx 执行 filter/sort/rename 等操作。",
    parameters: {
      inputFilename: { type: "string", required: true },
      operations: { type: "array" },
      outputBasename: { type: "string" },
    },
    execute: (args) => callEcho("apply_excel_ops", args),
  });
}
