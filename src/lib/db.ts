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
  provider: "cursor-compatible" | "openai" | "demo";
  baseUrl: string;
  apiKey: string;
  model: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  provider: "demo",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
};

export function getSettings(): AppSettings {
  const database = getDb();
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get("llm") as
    | { value: string }
    | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings) {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run("llm", JSON.stringify(settings));
}
