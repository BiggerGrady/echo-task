import PptxGenJS from "pptxgenjs";
import { chatCompletion } from "../llm";
import { buildSkillContext } from "../skills";

export type PptSlideLayout = "cover" | "section" | "bullets" | "two_column" | "closing";

export type PptSlide = {
  layout: PptSlideLayout;
  title: string;
  subtitle?: string;
  bullets?: string[];
  left?: string[];
  right?: string[];
};

export type PptOutline = {
  title: string;
  subtitle?: string;
  slides: PptSlide[];
};

const MAX_SLIDES = 16;

export function parsePptOutline(raw: string): { outline: PptOutline; parseOk: boolean } {
  try {
    const parsed = JSON.parse(raw) as PptOutline;
    if (!parsed?.title || !Array.isArray(parsed.slides)) {
      return { outline: fallbackOutline(raw.slice(0, 80)), parseOk: false };
    }
    return {
      outline: {
        title: String(parsed.title).slice(0, 80),
        subtitle: parsed.subtitle ? String(parsed.subtitle).slice(0, 120) : undefined,
        slides: parsed.slides.slice(0, MAX_SLIDES).map(normalizeSlide),
      },
      parseOk: true,
    };
  } catch {
    return { outline: fallbackOutline("演示文稿"), parseOk: false };
  }
}

function normalizeSlide(s: PptSlide): PptSlide {
  const layout: PptSlideLayout = ["cover", "section", "bullets", "two_column", "closing"].includes(
    s.layout
  )
    ? s.layout
    : "bullets";
  return {
    layout,
    title: String(s.title || "未命名").slice(0, 60),
    subtitle: s.subtitle ? String(s.subtitle).slice(0, 120) : undefined,
    bullets: Array.isArray(s.bullets) ? s.bullets.map((b) => String(b).slice(0, 80)).slice(0, 6) : undefined,
    left: Array.isArray(s.left) ? s.left.map((b) => String(b).slice(0, 80)).slice(0, 5) : undefined,
    right: Array.isArray(s.right) ? s.right.map((b) => String(b).slice(0, 80)).slice(0, 5) : undefined,
  };
}

export function fallbackOutline(seed: string): PptOutline {
  const title = seed.trim().slice(0, 40) || "工作汇报";
  return {
    title,
    subtitle: "由 Echo Task 生成（可再编辑）",
    slides: [
      { layout: "cover", title, subtitle: "内部汇报" },
      {
        layout: "bullets",
        title: "核心观点",
        bullets: [title, "补充数据与结论", "明确下一步"],
      },
      { layout: "closing", title: "谢谢", subtitle: "欢迎讨论" },
    ],
  };
}

export async function outlinePptx(input: {
  instruction: string;
  sourceText?: string;
  modelOverride?: string;
  signal?: AbortSignal;
}): Promise<{ outline: PptOutline; parseOk: boolean; demo: boolean; model: string }> {
  const skills = buildSkillContext("pptx");
  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `你是内部汇报 PPT 策划。结合 Skill 约束，只返回 JSON：
{"title":"演示标题","subtitle":"副标题可选","slides":[{"layout":"cover|section|bullets|two_column|closing","title":"...","subtitle":"...","bullets":["..."],"left":["..."],"right":["..."]}]}
规则：
1) 第一页 cover，最后一页 closing；中间 4–10 页为宜，总数不超过 ${MAX_SLIDES}。
2) 每页标题短；bullets 每条不超过 20 字、每页不超过 6 条。
3) two_column 用 left/right 各 2–4 条。
4) 不要写 JSON 以外的文字。`,
      },
      {
        role: "user",
        content: `用户需求：${input.instruction || "请做一份内部汇报 PPT"}

## PPT Skill
${skills}

## 参考材料
${(input.sourceText || "（无附件，仅按用户需求）").slice(0, 12000)}`,
      },
    ],
    { json: true, temperature: 0.3, modelOverride: input.modelOverride, signal: input.signal }
  );

  if (result.demo) {
    const parsed = parsePptOutline(result.content);
    return {
      outline: parsed.parseOk ? parsed.outline : fallbackOutline(input.instruction || "演示文稿"),
      parseOk: true,
      demo: true,
      model: result.model,
    };
  }

  const parsed = parsePptOutline(result.content);
  return { ...parsed, demo: false, model: result.model };
}

export async function renderPptx(outline: PptOutline): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "ECHO_16x9", width: 13.333, height: 7.5 });
  pptx.layout = "ECHO_16x9";
  pptx.author = "Echo Task";
  pptx.title = outline.title;

  const ink = "14212B";
  const celadon = "2F6F5E";
  const paper = "F3EFE6";
  const clay = "C46B3A";

  const slides = outline.slides.length ? outline.slides : fallbackOutline(outline.title).slides;

  for (const spec of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: paper };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.18,
      h: 7.5,
      fill: { color: celadon },
      line: { color: celadon },
    });

    if (spec.layout === "cover") {
      slide.addText(spec.title, {
        x: 0.7,
        y: 2.2,
        w: 12,
        h: 1.4,
        fontSize: 36,
        fontFace: "Calibri",
        bold: true,
        color: ink,
      });
      slide.addText(spec.subtitle || outline.subtitle || "", {
        x: 0.7,
        y: 3.7,
        w: 12,
        h: 0.6,
        fontSize: 16,
        fontFace: "Calibri",
        color: celadon,
      });
      continue;
    }

    if (spec.layout === "section") {
      slide.addText(spec.title, {
        x: 0.7,
        y: 3,
        w: 12,
        h: 1.2,
        fontSize: 32,
        fontFace: "Calibri",
        bold: true,
        color: celadon,
      });
      continue;
    }

    if (spec.layout === "closing") {
      slide.addText(spec.title, {
        x: 0.7,
        y: 2.8,
        w: 12,
        h: 1,
        fontSize: 32,
        fontFace: "Calibri",
        bold: true,
        color: ink,
      });
      slide.addText(spec.subtitle || "欢迎提问", {
        x: 0.7,
        y: 4,
        w: 12,
        h: 0.5,
        fontSize: 16,
        color: clay,
      });
      continue;
    }

    slide.addText(spec.title, {
      x: 0.7,
      y: 0.4,
      w: 12,
      h: 0.7,
      fontSize: 22,
      fontFace: "Calibri",
      bold: true,
      color: ink,
    });

    if (spec.layout === "two_column") {
      const left = (spec.left || spec.bullets || []).map((t) => ({ text: t, options: { bullet: true } }));
      const right = (spec.right || []).map((t) => ({ text: t, options: { bullet: true } }));
      slide.addText(left, { x: 0.7, y: 1.4, w: 5.6, h: 5.4, fontSize: 16, color: ink, valign: "top" });
      slide.addText(right, { x: 6.8, y: 1.4, w: 5.8, h: 5.4, fontSize: 16, color: ink, valign: "top" });
      continue;
    }

    const bullets = (spec.bullets || []).map((t) => ({ text: t, options: { bullet: true } }));
    slide.addText(bullets.length ? bullets : [{ text: spec.subtitle || " ", options: { bullet: false } }], {
      x: 0.7,
      y: 1.4,
      w: 11.8,
      h: 5.4,
      fontSize: 18,
      color: ink,
      valign: "top",
    });
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  if (Buffer.isBuffer(out)) return out;
  return Buffer.from(out as Uint8Array);
}
