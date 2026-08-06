"use client";

import { useEffect, useState } from "react";

type Model = {
  id: string;
  label: string;
  vendor: string;
  description: string;
};

type Settings = {
  provider: "cursor-compatible" | "openai" | "demo";
  baseUrl: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
};

export default function SettingsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [form, setForm] = useState<Settings>({
    provider: "demo",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    apiKey: "",
    hasApiKey: false,
  });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/settings"), fetch("/api/llm/test")]).then(async ([s, m]) => {
      const settings = await s.json();
      const modelData = await m.json();
      setForm(settings);
      setModels(modelData.models || []);
    });
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          baseUrl: form.baseUrl,
          model: form.model,
          apiKey: apiKeyInput || undefined,
        }),
      });
      setApiKeyInput("");
      const refreshed = await (await fetch("/api/settings")).json();
      setForm(refreshed);
      setMessage("已保存");
    } catch {
      setMessage("保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setMessage("");
    const res = await fetch("/api/llm/test", { method: "POST" });
    const data = await res.json();
    setMessage(data.message);
    setTesting(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-ink md:text-5xl">模型设置</h1>
        <p className="mt-3 max-w-2xl text-ink-soft/75">
          Cursor 本身不直接暴露 HTTP 模型 API。这里以「Cursor 可用模型列表」作为入口，
          通过 OpenAI 兼容协议对接你可访问的供应商（含免费额度）。未配置 Key 时走演示模式。
        </p>
      </header>

      <section className="panel space-y-4 rounded-2xl p-6 shadow-soft">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">调用模式</span>
          <select
            value={form.provider}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                provider: e.target.value as Settings["provider"],
              }))
            }
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
          >
            <option value="demo">演示模式（无需 Key）</option>
            <option value="cursor-compatible">Cursor 兼容入口（OpenAI Compatible）</option>
            <option value="openai">OpenAI 官方</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">Base URL</span>
          <input
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            placeholder="https://api.openai.com/v1"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">API Key</span>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            placeholder={form.hasApiKey ? `已保存 ${form.apiKey}` : "粘贴你的 API Key"}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">模型（Cursor 可用清单）</span>
          <select
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.vendor}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-celadon px-4 py-2 text-sm text-paper hover:bg-celadon-bright disabled:opacity-60"
          >
            {saving ? "保存中…" : "保存设置"}
          </button>
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="rounded-xl bg-ink px-4 py-2 text-sm text-paper disabled:opacity-60"
          >
            {testing ? "测试中…" : "测试连通"}
          </button>
        </div>
        {message && <p className="text-sm text-ink-soft/80">{message}</p>}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {models.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setForm((f) => ({ ...f, model: m.id }))}
            className={`panel rounded-2xl p-4 text-left transition ${
              form.model === m.id ? "border-celadon ring-1 ring-celadon/40" : ""
            }`}
          >
            <p className="font-display text-xl text-ink">{m.label}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-celadon">{m.vendor}</p>
            <p className="mt-2 text-sm text-ink-soft/70">{m.description}</p>
          </button>
        ))}
      </section>
    </div>
  );
}
