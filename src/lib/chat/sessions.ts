import { getDb } from "../db";
import { randomUUID } from "crypto";

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageRow = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachmentsJson: string;
  metaJson: string;
  createdAt: string;
};

type SessionRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  attachments_json: string;
  meta_json: string;
  created_at: string;
};

function ensureChatTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
      ON chat_messages(session_id, created_at);
  `);
}

function mapSession(row: SessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): ChatMessageRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as ChatMessageRow["role"],
    content: row.content,
    attachmentsJson: row.attachments_json,
    metaJson: row.meta_json,
    createdAt: row.created_at,
  };
}

export function createSession(title = "新对话"): ChatSession {
  ensureChatTables();
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`
    )
    .run(id, title, now, now);
  return getSession(id)!;
}

export function listSessions(limit = 50): ChatSession[] {
  ensureChatTables();
  const rows = getDb()
    .prepare(`SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as SessionRow[];
  return rows.map(mapSession);
}

export function getSession(id: string): ChatSession | null {
  ensureChatTables();
  const row = getDb().prepare(`SELECT * FROM chat_sessions WHERE id = ?`).get(id) as
    | SessionRow
    | undefined;
  return row ? mapSession(row) : null;
}

export function touchSession(id: string, title?: string) {
  ensureChatTables();
  const now = new Date().toISOString();
  if (title) {
    getDb()
      .prepare(`UPDATE chat_sessions SET updated_at = ?, title = ? WHERE id = ?`)
      .run(now, title, id);
  } else {
    getDb().prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ?`).run(now, id);
  }
}

export function deleteSession(id: string): boolean {
  ensureChatTables();
  const existing = getSession(id);
  if (!existing) return false;
  const db = getDb();
  db.prepare(`DELETE FROM chat_messages WHERE session_id = ?`).run(id);
  db.prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(id);
  return true;
}

export function addMessage(input: {
  sessionId: string;
  role: ChatMessageRow["role"];
  content: string;
  attachments?: unknown[];
  meta?: Record<string, unknown>;
}): ChatMessageRow {
  ensureChatTables();
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO chat_messages
       (id, session_id, role, content, attachments_json, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.sessionId,
      input.role,
      input.content,
      JSON.stringify(input.attachments || []),
      JSON.stringify(input.meta || {}),
      now
    );
  touchSession(input.sessionId);
  return getMessage(id)!;
}

export function getMessage(id: string): ChatMessageRow | null {
  ensureChatTables();
  const row = getDb().prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(id) as
    | MessageRow
    | undefined;
  return row ? mapMessage(row) : null;
}

export function listMessages(sessionId: string, limit = 100): ChatMessageRow[] {
  ensureChatTables();
  const rows = getDb()
    .prepare(
      `SELECT * FROM chat_messages
       WHERE session_id = ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(sessionId, limit) as MessageRow[];
  return rows.map(mapMessage);
}

/** Latest N turns (user+assistant pairs approximated by last N messages). */
export function listRecentMessages(sessionId: string, limit = 20): ChatMessageRow[] {
  ensureChatTables();
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
         SELECT * FROM chat_messages
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT ?
       ) ORDER BY created_at ASC`
    )
    .all(sessionId, limit) as MessageRow[];
  return rows.map(mapMessage);
}
