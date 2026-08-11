"use client";

import { useId, useRef, useState } from "react";

type Props = {
  accept: string;
  label: string;
  hint: string;
  file: File | null;
  onFile: (file: File | null) => void;
  maxBytes?: number;
};

export function FileDropzone({ accept, label, hint, file, onFile, maxBytes }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  function pickFile(next: File | null) {
    setError("");
    if (next && maxBytes && next.size > maxBytes) {
      setError(`文件过大，上限 ${Math.floor(maxBytes / (1024 * 1024))}MB`);
      onFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onFile(next);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`panel cursor-pointer rounded-2xl border-dashed p-6 transition ${
        dragging ? "border-celadon bg-mist/40" : "hover:border-celadon/40"
      }`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0] ?? null;
        pickFile(f);
      }}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
      <p className="font-display text-xl text-ink">{label}</p>
      <p className="mt-1 text-sm text-ink-soft/70">{hint}</p>
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex cursor-pointer rounded-xl bg-ink px-4 py-2 text-sm text-paper transition hover:bg-ink-soft"
        >
          选择文件
        </label>
        {file ? (
          <span className="text-sm text-celadon">
            已选：{file.name}（{(file.size / 1024).toFixed(1)} KB）
          </span>
        ) : (
          <span className="text-sm text-ink-soft/50">点击此区域或拖拽文件到此处</span>
        )}
        {file && (
          <button
            type="button"
            className="text-sm text-clay underline"
            onClick={(e) => {
              e.stopPropagation();
              if (inputRef.current) inputRef.current.value = "";
              pickFile(null);
            }}
          >
            清除
          </button>
        )}
      </div>
    </div>
  );
}
