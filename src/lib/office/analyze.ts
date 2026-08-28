import { chatCompletion } from "../llm";
import { buildSkillContext } from "../skills";
import type { SheetSnapshot } from "./types";
import { draftDocx, type ReportOutline } from "./report";

export type AnalyzeFinding = {
  id: number;
  sheet: string;
  kind: "missing" | "duplicate" | "outlier" | "inconsistent" | "trend" | "note";
  detail: string;
  evidence?: string;
  severity: "error" | "warning" | "info";
};

export type AnalyzeResult = {
  summary: string;
  findings: AnalyzeFinding[];
  metrics: Array<{ label: string; value: string }>;
};

function localScan(sheets: SheetSnapshot[]): AnalyzeResult {
  const findings: AnalyzeFinding[] = [];
  const metrics: Array<{ label: string; value: string }> = [];
  let id = 1;

  for (const sheet of sheets) {
    metrics.push({
      label: `${sheet.name} 样本行数`,
      value: String(sheet.rows.length),
    });
    if (!sheet.headers.length) {
      findings.push({
        id: id++,
        sheet: sheet.name,
        kind: "note",
        detail: "未识别到表头",
        severity: "info",
      });
      continue;
    }

    for (const header of sheet.headers) {
      const empty = sheet.rows.filter((r) => !String(r[header] ?? "").trim()).length;
      if (sheet.rows.length && empty / sheet.rows.length >= 0.3) {
        findings.push({
          id: id++,
          sheet: sheet.name,
          kind: "missing",
          detail: `列「${header}」空值约 ${Math.round((empty / sheet.rows.length) * 100)}%（样本）`,
          evidence: header,
          severity: empty === sheet.rows.length ? "error" : "warning",
        });
      }
    }

    const seen = new Map<string, number>();
    for (const row of sheet.rows) {
      const key = sheet.headers.map((h) => String(row[h] ?? "")).join("\t");
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const dup = [...seen.values()].filter((n) => n > 1).length;
    if (dup) {
      findings.push({
        id: id++,
        sheet: sheet.name,
        kind: "duplicate",
        detail: `样本中有 ${dup} 组重复行`,
        severity: "warning",
      });
    }
  }

  if (!findings.length) {
    findings.push({
      id: 1,
      sheet: sheets[0]?.name || "—",
      kind: "note",
      detail: "样本范围内未发现明显空值或重复；配置 API Key 后可做更完整分析。",
      severity: "info",
    });
  }

  return {
    summary: `已扫描 ${sheets.length} 张表、样本合计 ${sheets.reduce((n, s) => n + s.rows.length, 0)} 行。`,
    findings,
    metrics,
  };
}

export function parseAnalyzeResult(raw: string, fallback: AnalyzeResult): {
  result: AnalyzeResult;
  parseOk: boolean;
} {
  try {
    const parsed = JSON.parse(raw) as AnalyzeResult;
    if (!parsed?.summary || !Array.isArray(parsed.findings)) {
      return { result: fallback, parseOk: false };
    }
    return {
      result: {
        summary: String(parsed.summary).slice(0, 400),
        findings: parsed.findings.slice(0, 30).map((f, i) => ({
          id: Number(f.id) || i + 1,
          sheet: String(f.sheet || "—").slice(0, 40),
          kind: (["missing", "duplicate", "outlier", "inconsistent", "trend", "note"].includes(
            f.kind
          )
            ? f.kind
            : "note") as AnalyzeFinding["kind"],
          detail: String(f.detail || "").slice(0, 400),
          evidence: f.evidence ? String(f.evidence).slice(0, 200) : undefined,
          severity: (["error", "warning", "info"].includes(f.severity) ? f.severity : "info") as
            | "error"
            | "warning"
            | "info",
        })),
        metrics: Array.isArray(parsed.metrics)
          ? parsed.metrics.slice(0, 20).map((m) => ({
              label: String(m.label || "").slice(0, 40),
              value: String(m.value || "").slice(0, 80),
            }))
          : fallback.metrics,
      },
      parseOk: true,
    };
  } catch {
    return { result: fallback, parseOk: false };
  }
}

export function analysisToReport(fileName: string, analysis: AnalyzeResult): ReportOutline {
  return {
    title: `${fileName.replace(/\.[^.]+$/, "")} 分析结论`,
    subtitle: analysis.summary,
    sections: [
      {
        heading: "指标",
        bullets: analysis.metrics.length
          ? analysis.metrics.map((m) => `${m.label}：${m.value}`)
          : ["（无）"],
      },
      {
        heading: "发现",
        bullets: analysis.findings.map(
          (f) => `[${f.severity}] ${f.sheet} · ${f.kind}：${f.detail}`
        ),
      },
    ],
  };
}

export async function analyzeXlsx(input: {
  sheets: SheetSnapshot[];
  fileName: string;
  instruction?: string;
  modelOverride?: string;
  signal?: AbortSignal;
}): Promise<{
  analysis: AnalyzeResult;
  parseOk: boolean;
  demo: boolean;
  model: string;
}> {
  const local = localScan(input.sheets);
  const skills = buildSkillContext("analyze");
  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `你是表格分析助手。结合 Skill 与样本，只返回 JSON：
{"summary":"...","findings":[{"id":1,"sheet":"...","kind":"missing|duplicate|outlier|inconsistent|trend|note","detail":"...","evidence":"...","severity":"error|warning|info"}],"metrics":[{"label":"...","value":"..."}]}
不要编造样本中没有的数字。不要写 JSON 以外的文字。`,
      },
      {
        role: "user",
        content: `指令：${input.instruction || "请分析异常与结论，不要改表"}
文件：${input.fileName}

## 分析 Skill
${skills}

## 表格快照
${JSON.stringify(input.sheets).slice(0, 12000)}

## 本地初扫
${JSON.stringify(local).slice(0, 4000)}`,
      },
    ],
    { json: true, temperature: 0.1, modelOverride: input.modelOverride, signal: input.signal }
  );

  if (result.demo) {
    const parsed = parseAnalyzeResult(result.content, local);
    return {
      analysis: parsed.parseOk ? parsed.result : local,
      parseOk: true,
      demo: true,
      model: result.model,
    };
  }

  const parsed = parseAnalyzeResult(result.content, local);
  return { ...parsed, analysis: parsed.result, demo: false, model: result.model };
}

export async function renderAnalysisDocx(fileName: string, analysis: AnalyzeResult) {
  return draftDocx(analysisToReport(fileName, analysis));
}
