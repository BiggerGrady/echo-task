import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/status",
  "/api/auth/logout",
];

export function middleware(req: NextRequest) {
  const password =
    process.env.ECHO_ACCESS_PASSWORD?.trim() || process.env.ACCESS_PASSWORD?.trim() || "";
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("echo_access")?.value;
  const header =
    req.headers.get("x-echo-access") ||
    req.headers.get("x-access-password") ||
    (req.headers.get("authorization")?.startsWith("Bearer ")
      ? req.headers.get("authorization")!.slice(7)
      : null);

  if (cookie === password || header === password) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "未授权，请先通过访问口令验证", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
