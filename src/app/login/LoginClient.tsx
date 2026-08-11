"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "登录失败");
        return;
      }
      const next = search.get("next") || "/chat";
      router.replace(next);
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <form onSubmit={onSubmit} className="panel w-full rounded-2xl p-8 shadow-soft">
        <p className="font-display text-4xl text-ink">访问口令</p>
        <p className="mt-2 text-sm text-ink-soft/70">
          已启用 ECHO_ACCESS_PASSWORD，请输入口令后继续使用 Echo Task。
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-6 w-full rounded-xl border border-[var(--line)] bg-paper/80 px-4 py-3 text-ink outline-none focus:border-celadon"
          placeholder="访问口令"
          autoFocus
        />
        {error && <p className="mt-3 text-sm text-clay">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-6 w-full rounded-xl bg-celadon px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {loading ? "验证中…" : "进入"}
        </button>
      </form>
    </div>
  );
}
