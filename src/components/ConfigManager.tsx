"use client";

import { useEffect, useState } from "react";

type Scope = "global" | "word" | "excel";

type Item = {
  id: string;
  title: string;
  description: string;
  scope: Scope;
  content: string;
  enabled?: boolean;
  updatedAt: string;
};

const SCOPE_LABEL: Record<Scope, string> = {
  global: "全局",
  word: "文档校验",
  excel: "Excel 处理",
};

type Props = {
  kind: "references" | "skills";
  title: string;
  subtitle: string;
};

export function ConfigManager({ kind, title, subtitle }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    description: "",
    scope: "global" as Scope,
    content: "",
    enabled: true,
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/${kind}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [kind]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      body.set("title", form.title);
      body.set("description", form.description);
      body.set("scope", form.scope);
      body.set("content", form.content);
      if (kind === "skills") body.set("enabled", String(form.enabled));
      if (file) body.set("file", file);

      const res = await fetch(`/api/${kind}`, { method: "POST", body });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "保存失败");
      }
      setForm({ title: "", description: "", scope: "global", content: "", enabled: true });
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    await fetch(`/api/${kind}/${id}`, { method: "DELETE" });
    await load();
  }

  async function toggleEnabled(item: Item) {
    if (kind !== "skills") return;
    await fetch(`/api/${kind}/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise">
        <h1 className="font-display text-4xl text-ink md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-ink-soft/75">{subtitle}</p>
      </header>

      <form onSubmit={onCreate} className="panel animate-rise-delay space-y-4 rounded-2xl p-6 shadow-soft">
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
          <label className="text-sm text-ink-soft/80">
            附件（可选）
            <input
              type="file"
              className="mt-1 block text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {kind === "skills" && (
            <label className="flex items-center gap-2 text-sm text-ink-soft/80">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              创建后启用
            </label>
          )}
          <button
            type="submit"
            disabled={saving}
            className="ml-auto rounded-xl bg-celadon px-4 py-2 text-sm text-paper hover:bg-celadon-bright disabled:opacity-60"
          >
            {saving ? "保存中…" : "新增"}
          </button>
        </div>
        {error && <p className="text-sm text-clay">{error}</p>}
      </form>

      <section className="space-y-3">
        {loading ? (
          <p className="text-sm text-ink-soft/60">加载中…</p>
        ) : items.length === 0 ? (
          <p className="panel rounded-2xl p-6 text-sm text-ink-soft/70">暂无配置，先新增一条吧。</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="panel rounded-2xl p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-ink">{item.title}</h2>
                  <p className="mt-1 text-sm text-ink-soft/65">
                    {SCOPE_LABEL[item.scope]} · 更新于 {new Date(item.updatedAt).toLocaleString()}
                    {kind === "skills" ? (item.enabled ? " · 已启用" : " · 已停用") : null}
                  </p>
                </div>
                <div className="flex gap-2">
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
                    onClick={() => onDelete(item.id)}
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
