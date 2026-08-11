import { NextRequest, NextResponse } from "next/server";
import { getAccessPassword } from "./constants";

const COOKIE_NAME = "echo_access";

export function unauthorizedJson(message = "未授权，请先通过访问口令验证") {
  return NextResponse.json({ error: message, code: "UNAUTHORIZED" }, { status: 401 });
}

export function isAuthorized(req: NextRequest): boolean {
  const password = getAccessPassword();
  if (!password) return true;

  const header = req.headers.get("x-echo-access") || req.headers.get("x-access-password");
  if (header && header === password) return true;

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7) === password) return true;

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === password) return true;

  return false;
}

export function requireAuth(req: NextRequest): NextResponse | null {
  if (isAuthorized(req)) return null;
  return unauthorizedJson();
}

export function accessCookieOptions(password: string) {
  return {
    name: COOKIE_NAME,
    value: password,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export { COOKIE_NAME };
