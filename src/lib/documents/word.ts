import mammoth from "mammoth";
import { chatCompletion } from "../llm";
import { buildReferenceContext } from "../references";
import { buildSkillContext } from "../skills";
import { injectCommentsIntoDocx } from "./word-comments";
import fs from "fs";
import path from "path";
import { OUTPUTS_DIR } from "../paths";
import { randomUUID } from "crypto";

export type GrammarIssue = {
  id: number;
  original: string;
  suggestion: string;
  reason: string;
  severity: "error" | "warning" | "info";
};

export type WordValidationResult = {
  jobId: string;
  summary: string;
  issues: GrammarIssue[];
  outputFilename: string;
  demo: boolean;
  model: string;
  extractedTextPreview: string;
  commentedCount: number;
};

function parseIssues(raw: string): { summary: string; issues: GrammarIssue[] } {
  try {
    const parsed = JSON.parse(raw) as { summary?: string; issues?: GrammarIssue[] };
    return {
      summary: parsed.summary ?? "校验完成",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    return {
      summary: raw.slice(0, 300),
      issues: [],
    };
  }
}

function severityLabel(severity: GrammarIssue["severity"]) {
  if (severity === "error") return "错误";
  if (severity === "warning") return "警告";
  return "建议";
}

export async function validateWordDocument(
  fileBuffer: Buffer,
  originalName: string
): Promise<WordValidationResult> {
  const extracted = await mammoth.extractRawText({ buffer: fileBuffer });
  const text = extracted.value.trim();
  const preview = text.slice(0, 1200);

  const references = buildReferenceContext("word");
  const skills = buildSkillContext("word");

  const llm = await chatCompletion(
    [
      {
        role: "system",
        content: `你是中文/英文公文与业务文档校对专家。请检查语法、用词、标点、句式问题，并返回 JSON：
{"summary":"总评","issues":[{"id":1,"original":"原文中可定位的连续片段","suggestion":"修改建议","reason":"原因","severity":"error|warning|info"}]}
要求：
1) original 必须尽量是正文中真实出现的连续原文，便于在 Word 中挂批注；
2) 只返回 JSON；
3) 结合参考文档与 Skill 约束执行。`,
      },
      {
        role: "user",
        content: `文件名：${originalName}

## 参考文档
${references}

## Skill 配置
${skills}

## 待校验正文
${text.slice(0, 24000)}`,
      },
    ],
    { json: true, temperature: 0.1 }
  );

  const { summary, issues } = parseIssues(llm.content);

  const commentPayloads = [
    ...issues.map((issue) => {
      const locate = (issue.original || "").trim();
      return {
        locate,
        body: [
          locate ? `【定位】${locate}` : "",
          `[${severityLabel(issue.severity)}] ${issue.reason || "需修订"}`,
          issue.suggestion ? `建议：${issue.suggestion}` : "",
          issue.original ? `原文：${issue.original}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }),
    ...(summary
      ? [
          {
            locate: "",
            body: `【总评】${summary}`,
          },
        ]
      : []),
  ];

  const normalizedComments = commentPayloads.map((c, i) => ({
    id: i,
    body: c.body,
    author: "Echo Task",
    initials: "ET",
  }));

  const annotated = await injectCommentsIntoDocx(fileBuffer, normalizedComments);
  const jobId = randomUUID();
  const safeBase = path.basename(originalName, path.extname(originalName)) || "document";
  const outputFilename = `${jobId}-${safeBase}-批注.docx`;
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUTS_DIR, outputFilename), annotated);

  return {
    jobId,
    summary,
    issues,
    outputFilename,
    demo: llm.demo,
    model: llm.model,
    extractedTextPreview: preview,
    commentedCount: normalizedComments.length,
  };
}
