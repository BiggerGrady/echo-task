import { chatCompletion } from "../llm";
import type { IngestedSkillDraft } from "./types";

const SOURCE_LIMIT = 24_000;

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function fetchUrlText(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL 无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https 链接");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "EchoTaskSkillIngest/0.1" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`);
    const ctype = res.headers.get("content-type") || "";
    const raw = await res.text();
    if (ctype.includes("html") || raw.trim().startsWith("<")) return stripHtml(raw);
    return raw.trim();
  } catch (error) {
    if (controller.signal.aborted) throw new Error("抓取超时，请改为粘贴正文");
    throw error instanceof Error ? error : new Error("抓取失败");
  } finally {
    clearTimeout(timer);
  }
}

function demoDraft(source: string, sourceUrl: string | null): IngestedSkillDraft {
  const lines = source
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8)
    .slice(0, 8);
  const checks = lines.map((l, i) => `${i + 1}. ${l.slice(0, 80)}`);
  const title = sourceUrl ? `合规草案（来自链接）` : "合规草案（来自文案）";
  const content = `# 合规 Skill：${title}

## 适用范围
演示模式根据来源摘录生成，启用前请人工审阅。配置 DeepSeek 后可获得更完整的清单。

## 必须检查项（可勾选清单）
${checks.length ? checks.join("\n") : "1. 来源正文过短，请补充规范全文后重新整理"}

## 禁止 / 敏感表述
- （演示）待人工补充禁止词与敏感口径

## 格式与结构要求
- 保留原文结构层次；缺项需在批注中标明条款依据

## 输出要求（批注口径、严重级别）
- error：违反必须检查项
- warning：口径不清或格式不完整
- info：优化建议

## 来源与版本
- source_url: ${sourceUrl || "（粘贴文案）"}
- fetched_at: ${new Date().toISOString()}
- 人工确认状态：draft
`;
  return {
    title,
    description: "由文案/链接自动整理的合规 Skill 草稿（演示模式）",
    scope: "word",
    content,
    sourceUrl,
    sourceExcerpt: source.slice(0, 400),
    demo: true,
  };
}

export async function ingestComplianceSource(input: {
  text?: string;
  url?: string;
  note?: string;
}): Promise<IngestedSkillDraft> {
  let source = (input.text || "").trim();
  const sourceUrl = input.url?.trim() || null;
  if (sourceUrl && !source) {
    source = await fetchUrlText(sourceUrl);
  }
  if (!source) throw new Error("请粘贴规范文案，或提供可访问的 URL");
  source = source.slice(0, SOURCE_LIMIT);

  const structured = await chatCompletion(
    [
      {
        role: "system",
        content: `你是合规制度整理助手。把用户提供的规范原文整理成可执行的合规 Skill。只返回 JSON：
{"title":"短标题","description":"一两句说明","scope":"word","content":"完整 Markdown 正文"}
content 必须包含这些二级标题：适用范围、必须检查项（可勾选清单）、禁止 / 敏感表述、格式与结构要求、输出要求（批注口径、严重级别）、来源与版本。
来源与版本中写入 source_url、fetched_at（ISO）、人工确认状态：draft。
检查项要具体、可对照原文；不要编造原文没有的硬性条款。`,
      },
      {
        role: "user",
        content: `补充说明：${input.note || "无"}
source_url: ${sourceUrl || "（无，来自粘贴）"}
fetched_at: ${new Date().toISOString()}

## 规范原文
${source}`,
      },
    ],
    { json: true, temperature: 0.1 }
  );

  if (structured.demo) {
    return demoDraft(source, sourceUrl);
  }

  try {
    const parsed = JSON.parse(structured.content) as Partial<IngestedSkillDraft>;
    const title = (parsed.title || "合规 Skill 草稿").slice(0, 80);
    return {
      title,
      description: parsed.description || "由规范原文自动整理，待人工确认后启用",
      scope: parsed.scope === "excel" || parsed.scope === "global" ? parsed.scope : "word",
      content: parsed.content || demoDraft(source, sourceUrl).content,
      sourceUrl,
      sourceExcerpt: source.slice(0, 400),
      demo: false,
    };
  } catch {
    return demoDraft(source, sourceUrl);
  }
}
