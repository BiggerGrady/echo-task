"use client";

import { useState } from "react";
import { FileDropzone } from "@/components/FileDropzone";

type Result = {
  summary: string;
  outputFilename: string;
  demo: boolean;
  model: string;
  sheetNames: string[];
  preview: Record<string, string>[];
};

export default function ExcelPage() {
  const [file, setFile] = useState<File | null>(null);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !instruction.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("instruction", instruction);
      const res = await fetch("/api/excel/process", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "处理失败");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "处理失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-ink md:text-5xl">Excel 处理</h1>
        <p className="mt-3 max-w-2xl text-ink-soft/75">
          上传表格并用自然语言描述需求，例如「筛选状态为完成的行，并按日期升序」。
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        <FileDropzone
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          label="上传 Excel"
          hint="目前支持 .xlsx"
          file={file}
          onFile={setFile}
        />
        <label className="panel block rounded-2xl p-5">
          <span className="font-display text-xl text-ink">处理指令</span>
          <textarea
            required
            rows={4}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm outline-none focus:border-celadon"
            placeholder="例如：删除空行，保留姓名/部门/金额三列，并按金额降序排序"
          />
        </label>
        <button
          type="submit"
          disabled={!file || !instruction.trim() || loading}
          className="rounded-xl bg-celadon px-5 py-2.5 text-sm text-paper hover:bg-celadon-bright disabled:opacity-50"
        >
          {loading ? "处理中…" : "开始处理"}
        </button>
      </form>

      {error && <p className="text-sm text-clay">{error}</p>}

      {result && (
        <section className="panel space-y-4 rounded-2xl p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-ink">处理结果</h2>
              <p className="mt-1 text-sm text-ink-soft/65">
                模型：{result.model}
                {result.demo ? "（演示模式）" : ""} · 工作表：{result.sheetNames.join(", ") || "—"}
              </p>
            </div>
            <a
              href={`/api/download/${result.outputFilename}`}
              className="rounded-xl bg-ink px-4 py-2 text-sm text-paper"
            >
              下载处理后的文件
            </a>
          </div>
          <p className="text-sm leading-relaxed text-ink-soft/80">{result.summary}</p>
          {result.preview?.length > 0 && (
            <div className="overflow-auto rounded-xl bg-white/60">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    {Object.keys(result.preview[0]).map((k) => (
                      <th key={k} className="px-3 py-2 font-medium text-ink-soft">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row, i) => (
                    <tr key={i} className="border-b border-[var(--line)]/60">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-3 py-2 text-ink-soft/80">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
