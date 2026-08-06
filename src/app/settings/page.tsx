"use client";

import { useEffect, useState } from "react";
import { MODEL_CATALOG, type CatalogModel } from "@/lib/llm/cursor-models";

type Settings = {
  provider: "deepseek" | "cursor-compatible" | "openai" | "demo";
  baseUrl: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  keySource?: "database" | "env" | "none";
};

const PRESETS: Record<Settings["provider"], { baseUrl: string; model: string } | null> = {
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  "cursor-compatible": { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  demo: null,
};

export default function SettingsPage() {
  const [models, setModels] = useState<CatalogModel[]>(MODEL_CATALOG);
  const [form, setForm] = useState<Settings>({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKey: "",
    hasApiKey: false,
    keySource: "none",
  });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsRes, modelsRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/models"),
        ]);
        const settings = await settingsRes.json();
        const modelData = await modelsRes.json().catch(() => ({ models: MODEL_CATALOG }));
        if (cancelled) return;
        setForm({
          provider: settings.provider ?? "deepseek",
          baseUrl: settings.baseUrl ?? "https://api.deepseek.com",
          model: settings.model ?? "deepseek-chat",
          apiKey: settings.apiKey ?? "",
          hasApiKey: Boolean(settings.hasApiKey),
          keySource: settings.keySource ?? "none",
        });
        if (Array.isArray(modelData.models) && modelData.models.length) {
          setModels(modelData.models);
        }
      } catch {
        if (!cancelled) setMessage("加载设置失败，已使用本地默认模型列表");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onProviderChange(provider: Settings["provider"]) {
    const preset = PRESETS[provider];
    setForm((f) => ({
      ...f,
      provider,
      ...(preset ? { baseUrl: preset.baseUrl, model: preset.model } : {}),
    }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          baseUrl: form.baseUrl,
          model: form.model,
          apiKey: apiKeyInput || undefined,
        }),
      });
      const refreshed = await res.json();
      if (!res.ok) throw new Error(refreshed.error || "保存失败");
      setApiKeyInput("");
      setForm({
        provider: refreshed.provider,
        baseUrl: refreshed.baseUrl,
        model: refreshed.model,
        apiKey: refreshed.apiKey,
        hasApiKey: refreshed.hasApiKey,
        keySource: refreshed.keySource,
      });
      setMessage(
        `已保存：${refreshed.provider} / ${refreshed.model}` +
          (refreshed.hasApiKey ? "（已配置 Key）" : "（尚未配置 Key，将走演示模式）")
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setMessage("");
    try {
      const res = await fetch("/api/llm/test", { method: "POST" });
      const data = await res.json();
      setMessage(data.message || (data.ok ? "连通成功" : "连通失败"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "测试失败");
    } finally {
      setTesting(false);
    }
  }

  const keyHint =
    form.keySource === "env"
      ? "已从环境变量读取 Key（推荐，不会进仓库）"
      : form.keySource === "database"
        ? `已保存在本地数据库 ${form.apiKey}`
        : "尚未配置 Key";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-ink md:text-5xl">模型设置</h1>
        <p className="mt-3 max-w-2xl text-ink-soft/75">
          默认对接 DeepSeek（OpenAI 兼容）。推荐把 Key 放在本地 <code className="text-celadon">.env.local</code>
          ，不要发到聊天或提交到 Git。
        </p>
      </header>

      <section className="panel space-y-4 rounded-2xl p-6 shadow-soft">
        <div className="rounded-xl bg-mist/50 px-4 py-3 text-sm text-ink-soft/80">
          <p className="font-medium text-ink">推荐配置（.env.local）</p>
          <pre className="mt-2 overflow-auto text-xs leading-relaxed">{`DEEPSEEK_API_KEY=你的key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_PROVIDER=deepseek`}</pre>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">调用模式</span>
          <select
            value={form.provider}
            onChange={(e) => onProviderChange(e.target.value as Settings["provider"])}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
          >
            <option value="deepseek">DeepSeek（默认）</option>
            <option value="cursor-compatible">OpenAI Compatible（自定义）</option>
            <option value="openai">OpenAI 官方</option>
            <option value="demo">演示模式（无需 Key）</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">Base URL</span>
          <input
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            placeholder="https://api.deepseek.com"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">API Key</span>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 outline-none focus:border-celadon"
            placeholder="仅在本机填写；优先用 .env.local"
          />
          <span className="mt-1 block text-xs text-ink-soft/55">{keyHint}</span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft/70">模型（共 {models.length} 个）</span>
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
