import Link from "next/link";

const FEATURES = [
  {
    href: "/chat",
    title: "Agent 对话",
    copy: "统一处理 Word / Excel / 报告 / PPT：流式过程、多轮上下文、本轮模型切换。",
  },
  {
    href: "/history",
    title: "处理历史",
    copy: "每次处理的原文与结果都会保存，可回看和下载。",
  },
  {
    href: "/references",
    title: "参考文档",
    copy: "长期维护全局或功能级知识库，注入任务上下文。",
  },
  {
    href: "/skills",
    title: "Skill 配置",
    copy: "预留 Skill 入口，后续可挂载专用处理能力。",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-12 text-paper shadow-soft md:px-12 md:py-16">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-10 top-0 h-64 w-64 rounded-full bg-celadon-bright blur-3xl animate-pulse-soft" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-clay/50 blur-3xl" />
        </div>
        <div className="relative max-w-2xl animate-rise">
          <p className="font-display text-5xl leading-none tracking-tight md:text-7xl">Echo Task</p>
          <p className="mt-5 text-lg text-paper/75 md:text-xl">
            用对话完成 Word 校验、Excel 处理与分析、周报和内部汇报 PPT，默认对接 DeepSeek。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/chat"
              className="rounded-xl bg-celadon px-5 py-2.5 text-sm font-medium text-paper hover:bg-celadon-bright"
            >
              开始对话
            </Link>
            <Link
              href="/chat?type=report"
              className="rounded-xl border border-paper/20 px-5 py-2.5 text-sm text-paper/90 hover:bg-paper/10"
            >
              写一份周报
            </Link>
            <Link
              href="/chat?type=pptx"
              className="rounded-xl border border-paper/20 px-5 py-2.5 text-sm text-paper/90 hover:bg-paper/10"
            >
              做一份 PPT
            </Link>
            <Link
              href="/settings"
              className="rounded-xl border border-paper/20 px-5 py-2.5 text-sm text-paper/90 hover:bg-paper/10"
            >
              配置模型入口
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {FEATURES.map((f, i) => (
          <Link
            key={f.href}
            href={f.href}
            className="panel rounded-2xl p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-celadon/30"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <h2 className="font-display text-3xl text-ink">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft/70">{f.copy}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
