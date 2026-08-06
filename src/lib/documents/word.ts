import mammoth from "mammoth";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
} from "docx";
import { chatCompletion } from "../llm";
import { buildReferenceContext } from "../references";
import { buildSkillContext } from "../skills";
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

async function buildAnnotatedDocx(
  originalText: string,
  summary: string,
  issues: GrammarIssue[]
): Promise<Buffer> {
  const issueParagraphs = issues.flatMap((issue) => [
    new Paragraph({
      spacing: { before: 200, after: 80 },
      children: [
        new TextRun({
          text: `[${issue.severity.toUpperCase()}] #${issue.id} `,
          bold: true,
          color: issue.severity === "error" ? "B42318" : issue.severity === "warning" ? "B54708" : "175CD3",
        }),
        new TextRun({ text: issue.reason, italics: true }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "原文：", bold: true }),
        new TextRun({ text: issue.original }),
      ],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "D0D5DD", space: 8 },
      },
      spacing: { after: 160 },
      children: [
        new TextRun({ text: "建议：", bold: true, color: "027A48" }),
        new TextRun({ text: issue.suggestion, color: "027A48" }),
      ],
    }),
  ]);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("Echo Task · Word 语法校验报告")],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: summary })],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun(`问题列表（${issues.length}）`)],
          }),
          ...issueParagraphs,
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("原文摘录")],
          }),
          ...originalText
            .split(/\n+/)
            .filter(Boolean)
            .slice(0, 80)
            .map(
              (line) =>
                new Paragraph({
                  spacing: { after: 80 },
                  children: [new TextRun(line)],
                })
            ),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
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
{"summary":"总评","issues":[{"id":1,"original":"原文片段","suggestion":"修改建议","reason":"原因","severity":"error|warning|info"}]}
只返回 JSON。结合参考文档与 Skill 约束执行。`,
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
  const annotated = await buildAnnotatedDocx(text, summary, issues);
  const jobId = randomUUID();
  const outputFilename = `${jobId}-word-report.docx`;
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
  };
}
