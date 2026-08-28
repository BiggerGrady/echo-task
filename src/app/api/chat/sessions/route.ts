import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createSession, listSessions } from "@/lib/chat/sessions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  return NextResponse.json({ sessions: listSessions(50, q || undefined) });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let title = "新对话";
  try {
    const body = (await req.json()) as { title?: string };
    if (body.title?.trim()) title = body.title.trim().slice(0, 40);
  } catch {
    // empty body ok
  }
  const session = createSession(title);
  return NextResponse.json({ session });
}
