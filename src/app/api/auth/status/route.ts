import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getAccessPassword } from "@/lib/constants";
import { isDemoMode } from "@/lib/llm";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const required = Boolean(getAccessPassword());
  return NextResponse.json({
    required,
    authorized: isAuthorized(req),
    demo: isDemoMode(),
  });
}
