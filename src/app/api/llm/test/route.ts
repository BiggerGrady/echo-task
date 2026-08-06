import { NextResponse } from "next/server";
import { testLlmConnection } from "@/lib/llm";
import { CURSOR_MODELS } from "@/lib/llm/cursor-models";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ models: CURSOR_MODELS });
}

export async function POST() {
  const result = await testLlmConnection();
  return NextResponse.json(result);
}
