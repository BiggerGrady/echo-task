import { NextRequest, NextResponse } from "next/server";
import { accessCookieOptions } from "@/lib/auth";
import { getAccessPassword } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const password = getAccessPassword();
  if (!password) {
    return NextResponse.json({ ok: true, required: false });
  }

  const body = (await req.json()) as { password?: string };
  if (!body.password || body.password !== password) {
    return NextResponse.json({ error: "口令不正确" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, required: true });
  const cookie = accessCookieOptions(password);
  res.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
  return res;
}
