import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { chatCompletion } from "../llm";
import { buildSkillContext } from "../skills";

export type ReportSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type ReportOutline = {
  title: string;
  subtitle?: string;
  sections: ReportSection[];
};

const MAX_SECTIONS = 12;

export function parseReportOutline(raw: string): { outline: ReportOutline; parseOk: boolean } {
  try {
    const parsed = JSON.parse(raw) as ReportOutline;
    if (!parsed?.title || !Array.isArray(parsed.sections)) {
      return { outline: fallbackReport(raw.slice(0, 40)), parseOk: false };
    }
    return {
      outline: {
        title: String(parsed.title).slice(0, 80),
        subtitle: parsed.subtitle ? String(parsed.subtitle).slice(0, 160) : undefined,
        sections: parsed.sections.slice(0, MAX_SECTIONS).map(normalizeSection),
      },
      parseOk: true,
    };
  } catch {
    return { outline: fallbackReport("工作汇报"), parseOk: false };
  }
}

function normalizeSection(s: ReportSection): ReportSection {
  return {
    heading: String(s.heading || "未命名").slice(0, 60),
    paragraphs: Array.isArray(s.paragraphs)
      ? s.paragraphs.map((p) => String(p).slice(0, 800)).slice(0, 8)
      : undefined,
    bullets: Array.isArray(s.bullets)
      ? s.bullets.map((b) => String(b).slice(0, 200)).slice(0, 10)
      : undefined,
  };
}

export function fallbackReport(seed: string): ReportOutline {
  const title = seed.trim().slice(0, 40) || "工作周报";
  return {
    title,
    subtitle: "由 Echo Task 生成（可再编辑）",
    sections: [
      {
        heading: "本周进展",
        bullets: [title, "补充可量化结果", "对齐相关方"],
      },
      {
        heading: "问题与风险",
        bullets: ["待补充风险与对策"],
      },
      {
        heading: "下周计划",
        bullets: ["明确优先级与交付物"],
      },
    ],
  };
}

export async function outlineReport(input: {
  instruction: string;
  sourceText?: string;
  modelOverride?: string;
  signal?: AbortSignal;
}): Promise<{ outline: ReportOutline; parseOk: boolean; demo: boolean; model: string }> {
  const skills = buildSkillContext("report");
  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `你是周报/工作总结写手。结合 Skill 约束，只返回 JSON：
{"title":"标题","subtitle":"副标题可选","sections":[{"heading":"...","paragraphs":["..."],"bullets":["..."]}]}
规则：
1) 按「进展 → 风险 → 计划 → 需协调」组织，章节不超过 ${MAX_SECTIONS}。
2) 不要编造材料中没有的数据。
3) 不要写 JSON 以外的文字。`,
      },
      {
        role: "user",
        content: `用户需求：${input.instruction || "请写一份本周工作汇报"}

## 报告 Skill
${skills}

## 参考材料
${(input.sourceText || "（无附件，仅按用户需求）").slice(0, 12000)}`,
      },
    ],
    { json: true, temperature: 0.3, modelOverride: input.modelOverride, signal: input.signal }
  );

  if (result.demo) {
    const parsed = parseReportOutline(result.content);
    return {
      outline: parsed.parseOk ? parsed.outline : fallbackReport(input.instruction || "工作周报"),
      parseOk: true,
      demo: true,
      model: result.model,
    };
  }

  const parsed = parseReportOutline(result.content);
  return { ...parsed, demo: false, model: result.model };
}

export async function draftDocx(outline: ReportOutline): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: outline.title,
          bold: true,
          size: 36,
          font: "Calibri",
        }),
      ],
    }),
  ];

  if (outline.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: outline.subtitle,
            italics: true,
            size: 22,
            color: "2F6F5E",
            font: "Calibri",
          }),
        ],
      })
    );
  }

  const sections = outline.sections.length ? outline.sections : fallbackReport(outline.title).sections;
  for (const section of sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: section.heading, font: "Calibri" })],
      })
    );
    for (const p of section.paragraphs || []) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: p, size: 22, font: "Calibri" })],
        })
      );
    }
    for (const b of section.bullets || []) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: [new TextRun({ text: b, size: 22, font: "Calibri" })],
        })
      );
    }
  }

  const doc = new Document({
    creator: "Echo Task",
    title: outline.title,
    sections: [{ children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
