"use client";

import { useCallback, useEffect, useState } from "react";
import { HISTORY_PAGE_SIZE } from "@/lib/constants";

type JobType = "word" | "excel" | "pptx" | "report" | "analyze";

type Job = {
  id: string;
  type: JobType;
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

const TYPE_LABEL: Record<JobType, string> = {
  word: "文档校验",
  excel: "Excel 处理",
  pptx: "PPT 制作",
  report: "写报告",
  analyze: "Excel 分析",
};
const STATUS_LABEL = {
  pending: "处理中",
  succeeded: "成功",
  failed: "失败",
} as const;

export default function HistoryPage() {
  const [items, setItems] = useState<Job[]>([]);
  const [filter, setFilter] = useState<"all" | JobType>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("type", filter);
      params.set("limit", String(HISTORY_PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await fetch(`/api/jobs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setItems(data.items || []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, offset]);

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
          每次 Word / Excel / PPT / 报告处理都会保存原文与结果，可分页回看；也可清理过期记录。
        </p>
        <p className="mt-2 text-xs text-ink-soft/55">
          元数据：data/echo.db · 原文：data/uploads/ · 结果：data/outputs/
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "word", "excel", "analyze", "report", "pptx"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setFilter(key);
              setOffset(0);
            }}
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
        <button
          type="button"
          disabled={cleaning}
          onClick={async () => {
            if (!window.confirm("删除 30 天前的已完成/失败任务及其文件？进行中的任务不会删除。")) {
              return;
            }
            setCleaning(true);
            setError("");
            try {
              const res = await fetch("/api/jobs/cleanup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ olderThanDays: 30 }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "清理失败");
              setOffset(0);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "清理失败");
            } finally {
              setCleaning(false);
            }
          }}
          className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm text-clay"
        >
          {cleaning ? "清理中…" : "清理 30 天前"}
        </button>
      </div>

      {error && <p className="text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink-soft/60">加载中…</p>
      ) : items.length === 0 ? (
        <p className="panel rounded-2xl p-6 text-sm text-ink-soft/70">
          暂无处理记录。去「对话」跑一次 Word / Excel / 报告 / PPT 后会出现在这里。
        </p>
      ) : (
        <section className="space-y-3">
          {items.map((job) => (
            <article key={job.id} className="panel rounded-2xl p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-ink">{job.originalName || "未命名文件"}</h2>
                  <p className="mt-1 text-sm text-ink-soft/65">
                    {TYPE_LABEL[job.type] || job.type} · {STATUS_LABEL[job.status]} ·{" "}
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

      {total > HISTORY_PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-ink-soft">
          <span>
            第 {Math.floor(offset / HISTORY_PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))} 页 · 共 {total} 条
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset <= 0}
              onClick={() => setOffset((v) => Math.max(0, v - HISTORY_PAGE_SIZE))}
              className="rounded-lg bg-mist px-3 py-1.5 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={offset + HISTORY_PAGE_SIZE >= total}
              onClick={() => setOffset((v) => v + HISTORY_PAGE_SIZE)}
              className="rounded-lg bg-mist px-3 py-1.5 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
