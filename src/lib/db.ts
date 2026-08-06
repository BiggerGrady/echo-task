import Database from "better-sqlite3";
import fs from "fs";
import { DB_PATH, DATA_ROOT, UPLOADS_DIR, OUTPUTS_DIR, REFERENCES_DIR, SKILLS_DIR } from "./paths";

let db: Database.Database | null = null;

function ensureDirs() {
  for (const dir of [DATA_ROOT, UPLOADS_DIR, OUTPUTS_DIR, REFERENCES_DIR, SKILLS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS references_docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT 'global',
      filename TEXT,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT 'global',
      filename TEXT,
      content TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      input_filename TEXT,
      output_filename TEXT,
      instruction TEXT,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getDb(): Database.Database {
  if (db) return db;
  ensureDirs();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

export type AppSettings = {
  provider: "deepseek" | "cursor-compatible" | "openai" | "demo";
  baseUrl: string;
  apiKey: string;
  model: string;
};

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_SUPPORTED_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;

function normalizeDeepseekModel(model: string | undefined): string {
  if (model && (DEEPSEEK_SUPPORTED_MODELS as readonly string[]).includes(model)) {
    return model;
  }
  return DEEPSEEK_DEFAULT_MODEL;
}

export { normalizeDeepseekModel };

export const DEFAULT_SETTINGS: AppSettings = {
  provider: "deepseek",
  baseUrl: DEEPSEEK_BASE_URL,
  apiKey: "",
  model: DEEPSEEK_DEFAULT_MODEL,
};

function readEnvSettings(): Partial<AppSettings> {
  const apiKey =
    process.env.DEEPSEEK_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    "";
  const baseUrl =
    process.env.DEEPSEEK_BASE_URL?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    DEEPSEEK_BASE_URL;
  const model = normalizeDeepseekModel(
    process.env.DEEPSEEK_MODEL?.trim() || process.env.LLM_MODEL?.trim()
  );
  const providerRaw = process.env.LLM_PROVIDER?.trim() as AppSettings["provider"] | undefined;
  const provider: AppSettings["provider"] | undefined =
    providerRaw && ["deepseek", "cursor-compatible", "openai", "demo"].includes(providerRaw)
      ? providerRaw
      : apiKey
        ? "deepseek"
        : undefined;

  const result: Partial<AppSettings> = {};
  if (provider) result.provider = provider;
  if (baseUrl) result.baseUrl = baseUrl;
  if (model) result.model = model;
  if (apiKey) result.apiKey = apiKey;
  return result;
}

export function getSettings(): AppSettings {
  const fromEnv = readEnvSettings();
  const database = getDb();
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get("llm") as
    | { value: string }
    | undefined;

  if (!row) {
    const merged = { ...DEFAULT_SETTINGS, ...fromEnv };
    return { ...merged, model: normalizeDeepseekModel(merged.model) };
  }

  try {
    const saved = JSON.parse(row.value) as Partial<AppSettings>;
    const merged = {
      ...DEFAULT_SETTINGS,
      ...fromEnv,
      ...saved,
      // Prefer DB key when present; otherwise fall back to env (never commit secrets).
      apiKey: saved.apiKey?.trim() || fromEnv.apiKey || "",
    };
    return { ...merged, model: normalizeDeepseekModel(merged.model) };
  } catch {
    const merged = { ...DEFAULT_SETTINGS, ...fromEnv };
    return { ...merged, model: normalizeDeepseekModel(merged.model) };
  }
}

export function saveSettings(settings: AppSettings) {
  const database = getDb();
  const normalized: AppSettings = {
    ...settings,
    model: normalizeDeepseekModel(settings.model),
  };
  database
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run("llm", JSON.stringify(normalized));
}

export function getSettingsPublic() {
  const settings = getSettings();
  const envKey = Boolean(
    process.env.DEEPSEEK_API_KEY?.trim() || process.env.LLM_API_KEY?.trim()
  );
  const dbRow = getDb().prepare("SELECT value FROM settings WHERE key = ?").get("llm") as
    | { value: string }
    | undefined;
  let dbHasKey = false;
  if (dbRow) {
    try {
      const saved = JSON.parse(dbRow.value) as Partial<AppSettings>;
      dbHasKey = Boolean(saved.apiKey?.trim());
    } catch {
      dbHasKey = false;
    }
  }

  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: settings.apiKey ? `••••••••${settings.apiKey.slice(-4)}` : "",
    hasApiKey: Boolean(settings.apiKey),
    keySource: dbHasKey ? "database" : envKey ? "env" : "none",
  };
}
