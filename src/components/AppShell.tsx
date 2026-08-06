"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "总览", hint: "Overview" },
  { href: "/word", label: "文档校验", hint: "Word" },
  { href: "/excel", label: "Excel 处理", hint: "Sheets" },
  { href: "/references", label: "参考文档", hint: "Knowledge" },
  { href: "/skills", label: "Skill 配置", hint: "Skills" },
  { href: "/settings", label: "模型设置", hint: "LLM" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen grain">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 md:px-8">
        <aside className="panel sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col rounded-2xl p-5 shadow-soft md:flex">
          <div className="mb-8">
            <p className="font-display text-3xl tracking-tight text-ink">Echo Task</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft/70">
              文档与表格智能处理工作台
            </p>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3 py-2.5 transition ${
                    active
                      ? "bg-celadon text-paper"
                      : "text-ink-soft hover:bg-mist/60"
                  }`}
                >
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className={`text-[11px] ${active ? "text-paper/70" : "text-ink-soft/50"}`}>
                    {item.hint}
                  </div>
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl bg-ink px-3 py-3 text-xs leading-relaxed text-paper/80">
            默认对接 DeepSeek；Key 请放在本地 .env.local，不要发到聊天。
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="mb-4 flex items-center justify-between md:hidden">
            <p className="font-display text-2xl text-ink">Echo Task</p>
          </header>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
                    active ? "bg-celadon text-paper" : "panel text-ink-soft"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <main className="flex-1 animate-rise">{children}</main>
        </div>
      </div>
    </div>
  );
}
