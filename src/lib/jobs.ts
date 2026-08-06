import { getDb } from "./db";
import fs from "fs";
import path from "path";
import { OUTPUTS_DIR, UPLOADS_DIR } from "./paths";
import { randomUUID } from "crypto";

export type JobType = "word" | "excel";
export type JobStatus = "pending" | "succeeded" | "failed";

export type Job = {
  id: string;
  type: JobType;
  status: JobStatus;
  originalName: string;
  inputFilename: string | null;
  outputFilename: string | null;
  instruction: string;
  resultJson: string;
  error: string;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  type: string;
  status: string;
  original_name: string | null;
  input_filename: string | null;
  output_filename: string | null;
  instruction: string | null;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function ensureJobColumns() {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(jobs)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("original_name")) {
    db.exec(`ALTER TABLE jobs ADD COLUMN original_name TEXT NOT NULL DEFAULT ''`);
  }
}

function mapRow(row: Row): Job {
  return {
    id: row.id,
    type: row.type as JobType,
    status: row.status as JobStatus,
    originalName: row.original_name || "",
    inputFilename: row.input_filename,
    outputFilename: row.output_filename,
    instruction: row.instruction || "",
    resultJson: row.result_json || "",
    error: row.error || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createJob(input: {
  type: JobType;
  originalName: string;
  inputFilename: string;
  instruction?: string;
}): Job {
  ensureJobColumns();
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO jobs
     (id, type, status, original_name, input_filename, output_filename, instruction, result_json, error, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, NULL, ?, '', '', ?, ?)`
  ).run(id, input.type, input.originalName, input.inputFilename, input.instruction || "", now, now);
  return getJob(id)!;
}

export function completeJob(
  id: string,
  input: {
    status: Exclude<JobStatus, "pending">;
    outputFilename?: string | null;
    result?: unknown;
    error?: string;
  }
): Job | null {
  ensureJobColumns();
  const existing = getJob(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE jobs
       SET status = ?, output_filename = ?, result_json = ?, error = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.status,
      input.outputFilename ?? existing.outputFilename,
      input.result ? JSON.stringify(input.result) : existing.resultJson,
      input.error || "",
      now,
      id
    );
  return getJob(id);
}

export function listJobs(type?: JobType): Job[] {
  ensureJobColumns();
  const db = getDb();
  if (type) {
    return (db
      .prepare(`SELECT * FROM jobs WHERE type = ? ORDER BY created_at DESC`)
      .all(type) as Row[]).map(mapRow);
  }
  return (db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`).all() as Row[]).map(mapRow);
}

export function getJob(id: string): Job | null {
  ensureJobColumns();
  const row = getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function deleteJob(id: string): boolean {
  ensureJobColumns();
  const job = getJob(id);
  if (!job) return false;

  for (const name of [job.inputFilename, job.outputFilename]) {
    if (!name) continue;
    const inUploads = path.join(UPLOADS_DIR, path.basename(name));
    const inOutputs = path.join(OUTPUTS_DIR, path.basename(name));
    for (const p of [inUploads, inOutputs]) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore file delete errors
        }
      }
    }
  }

  getDb().prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
  return true;
}
