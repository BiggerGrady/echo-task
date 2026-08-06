import { getDb } from "../db";
import fs from "fs";
import path from "path";
import { REFERENCES_DIR } from "../paths";
import { randomUUID } from "crypto";

export type ReferenceScope = "global" | "word" | "excel";

export type ReferenceDoc = {
  id: string;
  title: string;
  description: string;
  scope: ReferenceScope;
  filename: string | null;
  content: string;
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
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): ReferenceDoc {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scope: row.scope as ReferenceScope,
    filename: row.filename,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listReferences(scope?: ReferenceScope): ReferenceDoc[] {
  const db = getDb();
  if (scope) {
    const rows = db
      .prepare(
        `SELECT * FROM references_docs
         WHERE scope = ? OR scope = 'global'
         ORDER BY updated_at DESC`
      )
      .all(scope) as Row[];
    return rows.map(mapRow);
  }
  const rows = db
    .prepare(`SELECT * FROM references_docs ORDER BY updated_at DESC`)
    .all() as Row[];
  return rows.map(mapRow);
}

export function getReference(id: string): ReferenceDoc | null {
  const row = getDb().prepare(`SELECT * FROM references_docs WHERE id = ?`).get(id) as
    | Row
    | undefined;
  return row ? mapRow(row) : null;
}

export function createReference(input: {
  title: string;
  description?: string;
  scope: ReferenceScope;
  content?: string;
  filename?: string | null;
  fileBuffer?: Buffer | null;
}): ReferenceDoc {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  let filename = input.filename ?? null;
  let content = input.content ?? "";

  if (input.fileBuffer && input.filename) {
    const safe = `${id}-${path.basename(input.filename)}`;
    fs.writeFileSync(path.join(REFERENCES_DIR, safe), input.fileBuffer);
    filename = safe;
    if (!content) {
      content = input.fileBuffer.toString("utf8").slice(0, 200000);
    }
  }

  db.prepare(
    `INSERT INTO references_docs
     (id, title, description, scope, filename, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.title, input.description ?? "", input.scope, filename, content, now, now);

  return getReference(id)!;
}

export function updateReference(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    scope: ReferenceScope;
    content: string;
    enabled: boolean;
  }>
): ReferenceDoc | null {
  const existing = getReference(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE references_docs
       SET title = ?, description = ?, scope = ?, content = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.title ?? existing.title,
      input.description ?? existing.description,
      input.scope ?? existing.scope,
      input.content ?? existing.content,
      now,
      id
    );
  return getReference(id);
}

export function deleteReference(id: string): boolean {
  const existing = getReference(id);
  if (!existing) return false;
  if (existing.filename) {
    const filePath = path.join(REFERENCES_DIR, existing.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  getDb().prepare(`DELETE FROM references_docs WHERE id = ?`).run(id);
  return true;
}

export function buildReferenceContext(scope: ReferenceScope): string {
  const docs = listReferences(scope);
  if (!docs.length) return "（暂无参考文档）";
  return docs
    .map(
      (d, i) =>
        `### 参考文档 ${i + 1}: ${d.title} [scope=${d.scope}]\n${d.description}\n${d.content.slice(0, 8000)}`
    )
    .join("\n\n");
}
