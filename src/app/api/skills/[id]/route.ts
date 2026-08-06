import { NextRequest, NextResponse } from "next/server";
import { deleteSkill, getSkill, updateSkill, type SkillScope } from "@/lib/skills";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = getSkill(id);
  if (!item) return NextResponse.json({ error: "未找到" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const item = updateSkill(id, {
    title: body.title,
    description: body.description,
    scope: body.scope as SkillScope,
    content: body.content,
    enabled: body.enabled,
  });
  if (!item) return NextResponse.json({ error: "未找到" }, { status: 404 });
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = deleteSkill(id);
  if (!ok) return NextResponse.json({ error: "未找到" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
