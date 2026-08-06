"use client";

import { useState } from "react";
import { FileDropzone } from "@/components/FileDropzone";

type Issue = {
  id: number;
  original: string;
  suggestion: string;
  reason: string;
  severity: string;
};

type Result = {
  summary: string;
  issues: Issue[];
  outputFilename: string;
  demo: boolean;
  model: string;
  extractedTextPreview: string;
};

export default function WordPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/word/validate", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "校验失败");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "校验失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-ink md:text-5xl">文档校验</h1>
        <p className="mt-3 max-w-2xl text-ink-soft/75">
          上传 Word（.docx），系统结合参考文档与 Skill，检查语法问题并生成标注报告。
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <FileDropzone
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          label="上传 Word 文档"
          hint="目前支持 .docx"
          file={file}
          onFile={setFile}
        />
        <button
          type="submit"
          disabled={!file || loading}
          className="rounded-xl bg-celadon px-5 py-2.5 text-sm text-paper hover:bg-celadon-bright disabled:opacity-50"
        >
          {loading ? "校验中…" : "开始校验"}
        </button>
      </form>

      {error && <p className="text-sm text-clay">{error}</p>}

      {result && (
        <section className="panel space-y-4 rounded-2xl p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-ink">校验结果</h2>
              <p className="mt-1 text-sm text-ink-soft/65">
                模型：{result.model}
                {result.demo ? "（演示模式）" : ""}
              </p>
            </div>
            <a
              href={`/api/download/${result.outputFilename}`}
              className="rounded-xl bg-ink px-4 py-2 text-sm text-paper"
            >
              下载标注报告
            </a>
          </div>
          <p className="text-sm leading-relaxed text-ink-soft/80">{result.summary}</p>
          <div className="space-y-3">
            {result.issues.map((issue) => (
              <article key={issue.id} className="rounded-xl bg-ink/[0.03] p-4">
                <p className="text-xs uppercase tracking-wide text-clay">
                  {issue.severity} · #{issue.id}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-medium">原文：</span>
                  {issue.original}
                </p>
                <p className="mt-1 text-sm text-celadon">
                  <span className="font-medium">建议：</span>
                  {issue.suggestion}
                </p>
                <p className="mt-1 text-xs text-ink-soft/60">{issue.reason}</p>
              </article>
            ))}
          </div>
          {result.extractedTextPreview && (
            <details className="text-sm text-ink-soft/70">
              <summary className="cursor-pointer">原文预览</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white/50 p-3 text-xs">
                {result.extractedTextPreview}
              </pre>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
