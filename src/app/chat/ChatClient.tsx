"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";

type TaskType = "auto" | "word" | "excel" | "chat";

type Session = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: string;
  streaming?: boolean;
  meta?: Record<string, unknown>;
  attachments?: Array<{ name: string }>;
};

const MODELS = [
  { id: "deepseek-v4-flash", label: "deepseek-v4-flash" },
  { id: "deepseek-v4-pro", label: "deepseek-v4-pro" },
];

function parseSseChunk(buffer: string) {
  const events: Array<{ event: string; data: string }> = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";
  for (const part of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

export default function ChatClient() {
  const search = useSearchParams();
  const initialType = (search.get("type") as TaskType) || "auto";

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<TaskType>(
    initialType === "word" || initialType === "excel" ? initialType : "auto"
  );
  const [model, setModel] = useState("deepseek-v4-flash");
  const [demo, setDemo] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = useMemo(() => {
    if (sending) return false;
    if (file) return true;
    return text.trim().length > 0;
  }, [sending, file, text]);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/chat/sessions");
    if (!res.ok) return;
    const data = (await res.json()) as { sessions: Session[] };
    setSessions(data.sessions);
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/sessions/${id}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      session: Session;
      messages: Array<{
        id: string;
        role: UiMessage["role"];
        content: string;
        meta?: Record<string, unknown>;
        attachments?: Array<{ name: string }>;
      }>;
    };
    setSessionId(data.session.id);
    setMessages(
      data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        meta: m.meta,
        attachments: m.attachments,
      }))
    );
  }, []);

  useEffect(() => {
    void (async () => {
      const status = await fetch("/api/auth/status");
      if (status.ok) {
        const data = (await status.json()) as { demo?: boolean };
        setDemo(Boolean(data.demo));
      }
      await loadSessions();
    })();
  }, [loadSessions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusLine]);

  async function newChat() {
    const res = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新对话" }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { session: Session };
    setSessionId(data.session.id);
    setMessages([]);
    setError("");
    setStatusLine("");
    await loadSessions();
  }

  async function onSend(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;

    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError(`文件过大，上限 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`);
      return;
    }

    setSending(true);
    setError("");
    setStatusLine("准备发送…");

    const userMsg: UiMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text.trim() || (file ? `(附件处理)` : ""),
      attachments: file ? [{ name: file.name }] : [],
    };
    const assistantId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    const form = new FormData();
    form.set("message", text);
    form.set("type", type);
    form.set("model", model);
    if (sessionId) form.set("sessionId", sessionId);
    if (file) form.set("file", file);

    const pendingText = text;
    const pendingFile = file;
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";

    try {
      const res = await fetch("/api/chat", { method: "POST", body: form });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `请求失败 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;

        for (const ev of parsed.events) {
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(ev.data) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (ev.event === "meta") {
            if (typeof data.sessionId === "string") setSessionId(data.sessionId);
            if (data.demo) setDemo(true);
          } else if (ev.event === "status") {
            setStatusLine(String(data.message || ""));
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, status: String(data.message || "") } : m
              )
            );
          } else if (ev.event === "delta") {
            const chunk = String(data.text || "");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk, streaming: true }
                  : m
              )
            );
          } else if (ev.event === "result") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      meta: data,
                      streaming: false,
                      content: m.content || String(data.summary || "处理完成"),
                    }
                  : m
              )
            );
          } else if (ev.event === "error") {
            setError(String(data.message || "处理失败"));
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      streaming: false,
                      content: m.content || `处理失败：${data.message}`,
                      meta: { error: data.message },
                    }
                  : m
              )
            );
          } else if (ev.event === "done") {
            setStatusLine("");
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
            );
          }
        }
      }

      await loadSessions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "发送失败";
      setError(msg);
      setText(pendingText);
      setFile(pendingFile);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, content: m.content || `处理失败：${msg}` }
            : m
        )
      );
    } finally {
      setSending(false);
      setStatusLine("");
    }
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4 md:h-[calc(100vh-3.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-ink">对话</h1>
          <p className="mt-1 text-sm text-ink-soft/70">
            上传 Word / Excel，或直接提问；同一会话保留上下文。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void newChat()}
          className="rounded-xl bg-ink px-4 py-2 text-sm text-paper hover:bg-ink-soft"
        >
          新建对话
        </button>
      </div>

      {demo && (
        <div className="rounded-xl border border-clay/30 bg-clay/10 px-4 py-2 text-sm text-ink-soft">
          当前为演示模式：未配置 DeepSeek API Key，流式输出为模拟内容。
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="panel hidden max-h-full overflow-y-auto rounded-2xl p-3 lg:block">
          <p className="mb-2 px-2 text-xs uppercase tracking-wide text-ink-soft/50">会话</p>
          <div className="space-y-1">
            {sessions.length === 0 && (
              <p className="px-2 py-3 text-sm text-ink-soft/50">暂无会话</p>
            )}
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void loadSession(s.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                  sessionId === s.id
                    ? "bg-celadon text-paper"
                    : "text-ink-soft hover:bg-mist/50"
                }`}
              >
                <div className="truncate font-medium">{s.title || "未命名"}</div>
                <div
                  className={`mt-0.5 text-[11px] ${
                    sessionId === s.id ? "text-paper/70" : "text-ink-soft/45"
                  }`}
                >
                  {new Date(s.updatedAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel flex min-h-0 flex-col rounded-2xl shadow-soft">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
            <div className="text-sm text-ink-soft/70">
              {sessionId ? "当前会话已启用上下文" : "发送后将自动创建会话"}
            </div>
            <div className="rounded-full bg-mist/70 px-3 py-1 text-xs text-ink-soft">
              本轮：{model}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex h-full min-h-[200px] items-center justify-center text-center text-sm text-ink-soft/55">
                上传 .docx / .xlsx，或输入指令开始对话
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[92%] animate-rise rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "ml-auto bg-ink text-paper"
                    : "mr-auto bg-mist/45 text-ink"
                }`}
              >
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2 text-xs opacity-70">
                    附件：{m.attachments.map((a) => a.name).join(", ")}
                  </div>
                )}
                {m.status && m.streaming && (
                  <div className="mb-2 text-xs text-celadon animate-pulse-soft">{m.status}</div>
                )}
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {m.content || (m.streaming ? "…" : "")}
                </div>
                {m.meta?.downloadUrl ? (
                  <a
                    href={String(m.meta.downloadUrl)}
                    className="mt-3 inline-flex rounded-xl bg-celadon px-3 py-1.5 text-xs text-paper hover:bg-celadon-bright"
                  >
                    下载结果文件
                  </a>
                ) : null}
                {m.meta?.truncated ? (
                  <p className="mt-2 text-xs text-clay">正文/表格已截断后送模型</p>
                ) : null}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => void onSend(e)}
            className="border-t border-[var(--line)] px-4 py-3"
          >
            {error && <p className="mb-2 text-sm text-clay">{error}</p>}
            {statusLine && (
              <p className="mb-2 text-xs text-celadon animate-pulse-soft">{statusLine}</p>
            )}
            {file && (
              <div className="mb-2 flex items-center gap-2 text-sm text-ink-soft">
                <span>
                  已选：{file.name}（{(file.size / 1024).toFixed(1)} KB）
                </span>
                <button
                  type="button"
                  className="text-clay underline"
                  onClick={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  清除
                </button>
              </div>
            )}
            <div className="mb-2 flex flex-wrap gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TaskType)}
                className="rounded-xl border border-[var(--line)] bg-paper/80 px-3 py-2 text-sm"
              >
                <option value="auto">自动识别</option>
                <option value="word">Word 校验</option>
                <option value="excel">Excel 处理</option>
                <option value="chat">纯对话</option>
              </select>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-xl border border-[var(--line)] bg-paper/80 px-3 py-2 text-sm"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:bg-mist/40"
              >
                附件
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > MAX_UPLOAD_BYTES) {
                    setError(
                      `文件过大，上限 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`
                    );
                    e.target.value = "";
                    return;
                  }
                  setFile(f);
                  if (f && type === "auto") {
                    const lower = f.name.toLowerCase();
                    if (lower.endsWith(".docx")) setType("word");
                    if (lower.endsWith(".xlsx")) setType("excel");
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder="输入指令，例如：校验语法 / 按部门筛选并排序…"
                className="min-h-[56px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-paper/80 px-3 py-2 text-sm outline-none focus:border-celadon"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-xl bg-celadon px-5 text-sm font-medium text-paper disabled:opacity-50"
              >
                {sending ? "…" : "发送"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
