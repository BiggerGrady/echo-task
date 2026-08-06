import { NextResponse } from "next/server";
import { MODEL_CATALOG } from "@/lib/llm/cursor-models";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ models: MODEL_CATALOG });
}
