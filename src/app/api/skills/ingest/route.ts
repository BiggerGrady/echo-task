import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ingestComplianceSource } from "@/lib/office";
import { createSkill } from "@/lib/skills";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const body = (await req.json()) as {
    text?: string;
    url?: string;
    note?: string;
    save?: boolean;
    enabled?: boolean;
  };

  const draft = await ingestComplianceSource({
    text: body.text,
    url: body.url,
    note: body.note,
  });

  if (body.save === false) {
    return NextResponse.json({ draft, saved: false });
  }

  const skill = createSkill({
    title: draft.title,
    description: draft.description,
    scope: draft.scope,
    content: draft.content,
    enabled: body.enabled === true,
  });

  return NextResponse.json({
    draft,
    saved: true,
    skill,
    hint: skill.enabled
      ? "已保存并启用"
      : "已保存为草稿（未启用）。请在列表中审阅后点「启用」。",
  });
}
