import { NextRequest, NextResponse } from "next/server";
import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  getDb,
  getSettingsPublic,
  saveSettings,
  type AppSettings,
  DEFAULT_SETTINGS,
} from "@/lib/db";

export const runtime = "nodejs";

const PROVIDER_PRESETS: Record<
  AppSettings["provider"],
  { baseUrl: string; model: string } | null
> = {
  deepseek: { baseUrl: DEEPSEEK_BASE_URL, model: DEEPSEEK_DEFAULT_MODEL },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  "cursor-compatible": { baseUrl: DEEPSEEK_BASE_URL, model: DEEPSEEK_DEFAULT_MODEL },
  demo: null,
};

function readStoredSettings(): AppSettings {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get("llm") as
    | { value: string }
    | undefined;
  if (!row) return { ...DEFAULT_SETTINGS, apiKey: "" };
  try {
    const saved = JSON.parse(row.value) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      apiKey: saved.apiKey?.trim() || "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS, apiKey: "" };
  }
}

export async function GET() {
  return NextResponse.json(getSettingsPublic());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Partial<AppSettings> & {
    clearApiKey?: boolean;
  };
  const stored = readStoredSettings();
  const next: AppSettings = {
    provider: body.provider ?? stored.provider,
    baseUrl: body.baseUrl ?? stored.baseUrl,
    model: body.model ?? stored.model,
    apiKey: stored.apiKey,
  };

  if (body.provider && body.provider !== stored.provider) {
    const preset = PROVIDER_PRESETS[body.provider];
    if (preset) {
      if (body.baseUrl === undefined) next.baseUrl = preset.baseUrl;
      if (body.model === undefined) next.model = preset.model;
    }
  }

  if (body.clearApiKey) next.apiKey = "";
  else if (typeof body.apiKey === "string" && body.apiKey && !body.apiKey.includes("••••")) {
    next.apiKey = body.apiKey;
  }

  saveSettings(next);
  return NextResponse.json({ ok: true, ...getSettingsPublic() });
}
