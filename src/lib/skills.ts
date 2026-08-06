import { getDb } from "./db";
import fs from "fs";
import path from "path";
import { SKILLS_DIR } from "./paths";
import { randomUUID } from "crypto";

export type SkillScope = "global" | "word" | "excel";

export type Skill = {
  id: string;
  title: string;
  description: string;
  scope: SkillScope;
  filename: string | null;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  title: string;
  description: string;
  scope: string;
  filename: string | null;
  content: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): Skill {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scope: row.scope as SkillScope,
    filename: row.filename,
    content: row.content,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSkills(scope?: SkillScope, onlyEnabled = false): Skill[] {
  const db = getDb();
  let sql = `SELECT * FROM skills WHERE 1=1`;
  const params: unknown[] = [];
  if (scope) {
    sql += ` AND (scope = ? OR scope = 'global')`;
    params.push(scope);
  }
  if (onlyEnabled) sql += ` AND enabled = 1`;
  sql += ` ORDER BY updated_at DESC`;
  return (db.prepare(sql).all(...params) as Row[]).map(mapRow);
}

export function getSkill(id: string): Skill | null {
  const row = getDb().prepare(`SELECT * FROM skills WHERE id = ?`).get(id) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function createSkill(input: {
  title: string;
  description?: string;
  scope: SkillScope;
  content?: string;
  filename?: string | null;
  fileBuffer?: Buffer | null;
  enabled?: boolean;
}): Skill {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  let filename = input.filename ?? null;
  let content = input.content ?? "";

  if (input.fileBuffer && input.filename) {
    const safe = `${id}-${path.basename(input.filename)}`;
    fs.writeFileSync(path.join(SKILLS_DIR, safe), input.fileBuffer);
    filename = safe;
    if (!content) content = input.fileBuffer.toString("utf8").slice(0, 200000);
  }

  db.prepare(
    `INSERT INTO skills
     (id, title, description, scope, filename, content, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.title,
    input.description ?? "",
    input.scope,
    filename,
    content,
    input.enabled === false ? 0 : 1,
    now,
    now
  );

  return getSkill(id)!;
}

export function updateSkill(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    scope: SkillScope;
    content: string;
    enabled: boolean;
  }>
): Skill | null {
  const existing = getSkill(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE skills
       SET title = ?, description = ?, scope = ?, content = ?, enabled = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.title ?? existing.title,
      input.description ?? existing.description,
      input.scope ?? existing.scope,
      input.content ?? existing.content,
      input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
      now,
      id
    );
  return getSkill(id);
}

export function deleteSkill(id: string): boolean {
  const existing = getSkill(id);
  if (!existing) return false;
  if (existing.filename) {
    const filePath = path.join(SKILLS_DIR, existing.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  getDb().prepare(`DELETE FROM skills WHERE id = ?`).run(id);
  return true;
}

export function buildSkillContext(scope: SkillScope): string {
  const skills = listSkills(scope, true);
  if (!skills.length) return "（暂无启用的 Skill）";
  return skills
    .map(
      (s, i) =>
        `### Skill ${i + 1}: ${s.title} [scope=${s.scope}]\n${s.description}\n${s.content.slice(0, 8000)}`
    )
    .join("\n\n");
}
