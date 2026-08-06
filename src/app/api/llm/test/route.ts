import { NextResponse } from "next/server";
import { testLlmConnection } from "@/lib/llm";
import { MODEL_CATALOG } from "@/lib/llm/cursor-models";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ models: MODEL_CATALOG });
}

export async function POST() {
  const result = await testLlmConnection();
  return NextResponse.json(result);
}
