import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, type AppSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const settings = getSettings();
  return NextResponse.json({
    ...settings,
    apiKey: settings.apiKey ? "••••••••" + settings.apiKey.slice(-4) : "",
    hasApiKey: Boolean(settings.apiKey),
  });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Partial<AppSettings> & { clearApiKey?: boolean };
  const current = getSettings();
  const next: AppSettings = {
    provider: body.provider ?? current.provider,
    baseUrl: body.baseUrl ?? current.baseUrl,
    model: body.model ?? current.model,
    apiKey: current.apiKey,
  };

  if (body.clearApiKey) next.apiKey = "";
  else if (typeof body.apiKey === "string" && body.apiKey && !body.apiKey.includes("••••")) {
    next.apiKey = body.apiKey;
  }

  saveSettings(next);
  return NextResponse.json({ ok: true });
}
