import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  deleteSession,
  getSession,
  listMessages,
  touchSession,
} from "@/lib/chat/sessions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  const messages = listMessages(id, 200).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    attachments: JSON.parse(m.attachmentsJson || "[]"),
    meta: JSON.parse(m.metaJson || "{}"),
    createdAt: m.createdAt,
  }));
  return NextResponse.json({ session, messages });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  const body = (await req.json()) as { title?: string };
  if (body.title?.trim()) touchSession(id, body.title.trim().slice(0, 40));
  return NextResponse.json({ session: getSession(id) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const ok = deleteSession(id);
  if (!ok) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
