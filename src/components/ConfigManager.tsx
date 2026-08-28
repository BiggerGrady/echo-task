"use client";

import { useCallback, useEffect, useState } from "react";

type Scope = "global" | "word" | "excel" | "pptx";

type Item = {
  id: string;
  title: string;
  description: string;
  scope: Scope;
  content: string;
  filename?: string | null;
  enabled?: boolean;
  createdAt?: string;
  updatedAt: string;
};

const SCOPE_LABEL: Record<Scope, string> = {
  global: "全局",
  word: "文档校验",
  excel: "Excel 处理",
  pptx: "PPT 制作",
};

type Props = {
  kind: "references" | "skills";
  title: string;
  subtitle: string;
};

const emptyForm = {
  title: "",
  description: "",
  scope: "global" as Scope,
  content: "",
  enabled: true,
};

export function ConfigManager({ kind, title, subtitle }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ingestText, setIngestText] = useState("");
  const [ingestUrl, setIngestUrl] = useState("");
  const [ingestNote, setIngestNote] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const storageHint =
    kind === "references"
      ? "元数据：data/echo.db · 附件：data/references/"
      : "元数据：data/echo.db · 附件：data/skills/";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/${kind}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setItems(data.items || []);
      setInfo(`共 ${data.items?.length ?? 0} 条 · ${storageHint}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [kind, storageHint]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(item: Item) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description,
      scope: item.scope,
      content: item.content,
      enabled: item.enabled !== false,
    });
    setFile(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setFile(null);
    setError("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("标题必填");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        const res = await fetch(`/api/${kind}/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            scope: form.scope,
            content: form.content,
            ...(kind === "skills" ? { enabled: form.enabled } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "更新失败");
        setInfo(`已更新：${data.title}`);
        cancelEdit();
      } else {
        const body = new FormData();
        body.set("title", form.title);
        body.set("description", form.description);
        body.set("scope", form.scope);
        body.set("content", form.content);
        if (kind === "skills") body.set("enabled", String(form.enabled));
        if (file) body.set("file", file);

        const res = await fetch(`/api/${kind}`, { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "保存失败");
        setInfo(`已新增：${data.title}`);
        setForm(emptyForm);
        setFile(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string, itemTitle: string) {
    if (!window.confirm(`确认删除「${itemTitle}」？`)) return;
    const res = await fetch(`/api/${kind}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "删除失败");
      return;
    }
    if (editingId === id) cancelEdit();
    setInfo(`已删除：${itemTitle}`);
    await load();
  }

  async function toggleEnabled(item: Item) {
    if (kind !== "skills") return;
    const res = await fetch(`/api/${kind}/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "更新失败");
      return;
    }
    await load();
  }

  async function ingestSkill(e: React.FormEvent) {
    e.preventDefault();
    if (!ingestText.trim() && !ingestUrl.trim()) {
      setError("请粘贴规范文案，或填写 URL");
      return;
    }
    setIngesting(true);
    setError("");
    try {
      const res = await fetch("/api/skills/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ingestText,
          url: ingestUrl,
          note: ingestNote,
          save: true,
          enabled: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "整理失败");
      setInfo(data.hint || `已生成草稿：${data.skill?.title || data.draft?.title}`);
      setIngestText("");
      setIngestUrl("");
      setIngestNote("");
      if (data.skill) startEdit(data.skill);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "整理失败");
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <h1 className="font-display text-4xl text-ink md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-ink-soft/75">{subtitle}</p>
        <p className="mt-2 text-xs text-ink-soft/55">{storageHint}</p>
      </header>

      {kind === "skills" && (
        <form
          onSubmit={ingestSkill}
          className="panel space-y-4 rounded-2xl p-6 shadow-soft"
        >
          <p className="font-display text-2xl text-ink">从文案 / 链接生成合规 Skill</p>
          <p className="text-sm text-ink-soft/70">
            粘贴制度原文或提供 URL，模型会整理成检查清单草稿。默认不启用，请审阅后再点启用。
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft/70">规范 URL（可选）</span>
            <input
              value={ingestUrl}
              onChange={(e) => setIngestUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft/70">粘贴规范文案</span>
            <textarea
              rows={5}
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              placeholder="把制度、敏感词、格式要求粘贴到这里…"
              className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft/70">补充说明（可选）</span>
            <input
              value={ingestNote}
              onChange={(e) => setIngestNote(e.target.value)}
              placeholder="例如：适用于内部周报；检查口径要严格"
              className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            />
          </label>
          <button
            type="submit"
            disabled={ingesting}
            className="rounded-xl bg-ink px-4 py-2 text-sm text-paper disabled:opacity-60"
          >
            {ingesting ? "整理中…" : "生成合规草稿"}
          </button>
        </form>
      )}

      <form onSubmit={onSubmit} className="panel animate-rise-delay space-y-4 rounded-2xl p-6 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-2xl text-ink">
            {editingId ? "编辑条目" : "新增条目"}
          </p>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="text-sm text-ink-soft/70 underline">
              取消编辑
            </button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft/70">标题</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft/70">作用域</span>
            <select
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as Scope }))}
              className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            >
              <option value="global">全局</option>
              <option value="word">仅文档校验</option>
              <option value="excel">仅 Excel 处理</option>
              {kind === "skills" ? <option value="pptx">仅 PPT 制作</option> : null}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">描述</span>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">正文 / 规则内容</span>
          <textarea
            rows={6}
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            placeholder="可粘贴规范、术语表、处理规则等"
          />
        </label>
        <div className="flex flex-wrap items-center gap-4">
          {!editingId && (
            <label className="text-sm text-ink-soft/80">
              附件（可选）
              <input
                type="file"
                className="mt-1 block text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          {kind === "skills" && (
            <label className="flex items-center gap-2 text-sm text-ink-soft/80">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              启用
            </label>
          )}
          <button
            type="submit"
            disabled={saving}
            className="ml-auto rounded-xl bg-celadon px-4 py-2 text-sm text-paper hover:bg-celadon-bright disabled:opacity-60"
          >
            {saving ? "保存中…" : editingId ? "保存修改" : "新增"}
          </button>
        </div>
        {error && <p className="text-sm text-clay">{error}</p>}
        {info && !error && <p className="text-sm text-celadon">{info}</p>}
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-ink">已保存列表</h2>
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-mist px-3 py-1.5 text-sm text-ink-soft"
          >
            刷新
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-ink-soft/60">加载中…</p>
        ) : items.length === 0 ? (
          <p className="panel rounded-2xl p-6 text-sm text-ink-soft/70">
            当前没有已保存的{kind === "references" ? "参考文档" : "Skill"}。
            数据保存在本地 SQLite（data/echo.db）；若你之前在其他环境保存过，不会自动同步到这里。
          </p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="panel rounded-2xl p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm text-ink-soft/65">
                    {SCOPE_LABEL[item.scope]} · 更新于{" "}
                    {new Date(item.updatedAt).toLocaleString()}
                    {kind === "skills" ? (item.enabled ? " · 已启用" : " · 已停用") : null}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft/45">ID: {item.id}</p>
                  {item.filename && (
                    <p className="mt-1 text-xs text-ink-soft/45">附件: {item.filename}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="rounded-lg bg-mist px-3 py-1.5 text-sm text-ink-soft"
                  >
                    编辑
                  </button>
                  {kind === "skills" && (
                    <button
                      type="button"
                      onClick={() => toggleEnabled(item)}
                      className="rounded-lg bg-mist px-3 py-1.5 text-sm text-ink-soft"
                    >
                      {item.enabled ? "停用" : "启用"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(item.id, item.title)}
                    className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm text-clay"
                  >
                    删除
                  </button>
                </div>
              </div>
              {item.description && (
                <p className="mt-3 text-sm text-ink-soft/80">{item.description}</p>
              )}
              {item.content && (
                <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-ink/[0.03] p-3 text-xs leading-relaxed text-ink-soft/80 whitespace-pre-wrap">
                  {item.content}
                </pre>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
