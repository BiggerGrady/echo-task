"use client";

import { useCallback, useEffect, useState } from "react";

type Job = {
  id: string;
  type: "word" | "excel";
  status: "pending" | "succeeded" | "failed";
  originalName: string;
  inputFilename: string | null;
  outputFilename: string | null;
  instruction: string;
  resultJson: string;
  error: string;
  createdAt: string;
  updatedAt: string;
};

const TYPE_LABEL = { word: "文档校验", excel: "Excel 处理" } as const;
const STATUS_LABEL = {
  pending: "处理中",
  succeeded: "成功",
  failed: "失败",
} as const;

export default function HistoryPage() {
  const [items, setItems] = useState<Job[]>([]);
  const [filter, setFilter] = useState<"all" | "word" | "excel">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = filter === "all" ? "" : `?type=${filter}`;
      const res = await fetch(`/api/jobs${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete(job: Job) {
    if (!window.confirm(`确认删除「${job.originalName}」的处理记录及文件？`)) return;
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "删除失败");
      return;
    }
    await load();
  }

  function summaryOf(job: Job) {
    if (job.error) return job.error;
    if (!job.resultJson) return "—";
    try {
      const parsed = JSON.parse(job.resultJson) as { summary?: string };
      return parsed.summary || "—";
    } catch {
      return "—";
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-ink md:text-5xl">处理历史</h1>
        <p className="mt-3 max-w-2xl text-ink-soft/75">
          每次 Word / Excel 处理都会保存上传原文与结果文件，可随时回看和下载。
        </p>
        <p className="mt-2 text-xs text-ink-soft/55">
          元数据：data/echo.db · 原文：data/uploads/ · 结果：data/outputs/
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "word", "excel"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              filter === key ? "bg-celadon text-paper" : "panel text-ink-soft"
            }`}
          >
            {key === "all" ? "全部" : TYPE_LABEL[key]}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="ml-auto rounded-lg bg-mist px-3 py-1.5 text-sm text-ink-soft"
        >
          刷新
        </button>
      </div>

      {error && <p className="text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink-soft/60">加载中…</p>
      ) : items.length === 0 ? (
        <p className="panel rounded-2xl p-6 text-sm text-ink-soft/70">
          暂无处理记录。去「对话」上传 Word / Excel 跑一次任务后，会自动出现在这里。
        </p>
      ) : (
        <section className="space-y-3">
          {items.map((job) => (
            <article key={job.id} className="panel rounded-2xl p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-ink">{job.originalName || "未命名文件"}</h2>
                  <p className="mt-1 text-sm text-ink-soft/65">
                    {TYPE_LABEL[job.type]} · {STATUS_LABEL[job.status]} ·{" "}
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                  {job.instruction && (
                    <p className="mt-2 text-sm text-ink-soft/80">指令：{job.instruction}</p>
                  )}
                  <p className="mt-2 text-sm text-ink-soft/75">{summaryOf(job)}</p>
                  <p className="mt-1 text-xs text-ink-soft/45">任务 ID：{job.id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.inputFilename && (
                    <a
                      href={`/api/download/${encodeURIComponent(job.inputFilename)}?kind=input&jobId=${job.id}`}
                      className="rounded-lg bg-mist px-3 py-1.5 text-sm text-ink-soft"
                    >
                      下载原文
                    </a>
                  )}
                  {job.outputFilename && job.status === "succeeded" && (
                    <a
                      href={`/api/download/${encodeURIComponent(job.outputFilename)}?kind=output&jobId=${job.id}`}
                      className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper"
                    >
                      下载结果
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(job)}
                    className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm text-clay"
                  >
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
