import OpenAI from "openai";
import { getSettings, type AppSettings } from "../db";
import { normalizeModelId } from "./cursor-models";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmCallOptions = {
  temperature?: number;
  json?: boolean;
  modelOverride?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type LlmResult = {
  content: string;
  model: string;
  provider: AppSettings["provider"];
  demo: boolean;
};

const DEFAULT_TIMEOUT_MS = 90_000;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function resolveModel(override?: string) {
  const settings = getSettings();
  return normalizeModelId(override || settings.model, settings.model || "deepseek-v4-flash");
}

function withTimeoutSignal(timeoutMs: number, outer?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`LLM 请求超时（${timeoutMs}ms）`)), timeoutMs);
  const onAbort = () => controller.abort(outer?.reason || new Error("请求已取消"));
  if (outer) {
    if (outer.aborted) onAbort();
    else outer.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      if (outer) outer.removeEventListener("abort", onAbort);
    },
  };
}

function demoComplete(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const system = messages.find((m) => m.role === "system")?.content ?? "";

  if (
    system.includes("合规制度整理") ||
    lastUser.includes("## 规范原文")
  ) {
    return JSON.stringify({
      title: "合规 Skill 草稿",
      description: "演示模式整理结果，请人工审阅后启用。",
      scope: "word",
      content:
        "# 合规 Skill：演示草稿\n\n## 适用范围\n演示模式。\n\n## 必须检查项（可勾选清单）\n1. 请核对来源条款\n\n## 禁止 / 敏感表述\n- 待补充\n\n## 格式与结构要求\n- 待补充\n\n## 输出要求（批注口径、严重级别）\n- warning：演示项\n\n## 来源与版本\n- 人工确认状态：draft\n",
    });
  }

  if (
    system.includes("内部汇报 PPT") ||
    system.includes("PPT 策划") ||
    lastUser.includes("## PPT Skill")
  ) {
    return JSON.stringify({
      title: "本周工作汇报（演示）",
      subtitle: "演示模式生成的大纲，配置 API Key 后可按真实材料策划",
      slides: [
        { layout: "cover", title: "本周工作汇报", subtitle: "内部汇报" },
        {
          layout: "bullets",
          title: "本周进展",
          bullets: ["完成核心需求", "补齐测试用例", "对齐下周计划"],
        },
        {
          layout: "two_column",
          title: "风险与对策",
          left: ["外部接口依赖"],
          right: ["准备降级方案"],
        },
        { layout: "closing", title: "谢谢", subtitle: "欢迎讨论" },
      ],
    });
  }

  if (
    system.includes("合规审查") ||
    system.includes("合规 Skill") ||
    lastUser.includes("## 合规 Skill")
  ) {
    const body = lastUser.includes("## 正文")
      ? lastUser.split("## 正文").pop() ?? lastUser
      : lastUser;
    const snippet = body.replace(/\s+/g, " ").trim().slice(0, 80) || "（正文片段）";
    return JSON.stringify({
      summary: "演示模式合规审查：请启用真实 API Key 后按 Skill 清单检查。",
      issues: [
        {
          id: 1,
          original: snippet,
          suggestion: "对照合规 Skill 的必须检查项补全或改写该段。",
          reason: "演示：命中「必须检查项」示例",
          severity: "warning",
        },
      ],
    });
  }

  if (
    system.includes("语法") ||
    system.includes("grammar") ||
    system.includes("校对") ||
    lastUser.includes("待校验正文") ||
    lastUser.includes("## 正文") ||
    lastUser.toLowerCase().includes(".docx")
  ) {
    const body = lastUser.includes("## 待校验正文")
      ? lastUser.split("## 待校验正文").pop() ?? lastUser
      : lastUser.includes("## 正文")
        ? lastUser.split("## 正文").pop() ?? lastUser
        : lastUser;
    const sentences = body
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4)
      .slice(0, 5);

    const issues = sentences.map((text, i) => ({
      id: i + 1,
      original: text.slice(0, 120),
      suggestion: `${text.slice(0, 120)}（演示修改建议）`,
      reason: "演示模式：配置 DeepSeek 后可获得真实语法批注",
      severity: i % 2 === 0 ? "warning" : "info",
    }));

    return JSON.stringify({
      summary: "当前为演示模式。已按正文片段生成示例批注，配置 API Key 后可真实校对。",
      issues,
    });
  }

  if (
    system.includes("表格分析") ||
    lastUser.includes("## 分析 Skill")
  ) {
    return JSON.stringify({
      summary: "演示模式分析：样本范围内见空值与重复提示，原表未改。",
      findings: [
        {
          id: 1,
          sheet: "Sheet1",
          kind: "missing",
          detail: "请配置 API Key 后按真实样本统计空值比例。",
          severity: "warning",
        },
        {
          id: 2,
          sheet: "Sheet1",
          kind: "note",
          detail: "演示：不会改写原工作簿。",
          severity: "info",
        },
      ],
      metrics: [{ label: "模式", value: "demo" }],
    });
  }

  if (
    system.includes("周报") ||
    system.includes("报告策划") ||
    lastUser.includes("## 报告 Skill")
  ) {
    return JSON.stringify({
      title: "本周工作汇报（演示）",
      subtitle: "演示模式生成的大纲",
      sections: [
        { heading: "本周进展", bullets: ["完成核心需求", "补齐测试"] },
        { heading: "问题与风险", bullets: ["外部接口依赖，准备降级"] },
        { heading: "下周计划", bullets: ["联调", "验收"] },
      ],
    });
  }

  if (
    system.includes("Excel") ||
    system.includes("规划器") ||
    lastUser.toLowerCase().includes("excel") ||
    lastUser.includes("表格") ||
    lastUser.toLowerCase().includes(".xlsx")
  ) {
    return JSON.stringify({
      summary: "演示模式：将按示例规则返回处理计划，不会真实改写工作簿逻辑。",
      operations: [
        {
          type: "note",
          description: "请在 .env.local 或设置页配置 DeepSeek（https://api.deepseek.com）",
        },
      ],
      previewRows: [],
    });
  }

  return JSON.stringify({
    summary: "演示模式响应：请配置 DeepSeek API Key 以启用真实调用。",
    content: lastUser.slice(0, 500),
  });
}

async function* demoStream(messages: ChatMessage[]): AsyncGenerator<string> {
  const text =
    "（演示模式）正在结合参考文档与 Skill 分析你的请求…\n" +
    "我会先说明处理思路，再生成可执行结果。\n" +
    "当前未配置 API Key，输出为模拟流式内容。";
  for (const chunk of text.match(/[\s\S]{1,12}/g) || [text]) {
    yield chunk;
    await new Promise((r) => setTimeout(r, 20));
  }
  void messages;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: LlmCallOptions
): Promise<LlmResult> {
  const settings = getSettings();
  const model = resolveModel(options?.modelOverride);

  if (settings.provider === "demo" || !settings.apiKey.trim()) {
    return {
      content: demoComplete(messages),
      model,
      provider: "demo",
      demo: true,
    };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { signal, clear } = withTimeoutSignal(timeoutMs, options?.signal);

  try {
    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: normalizeBaseUrl(settings.baseUrl) || undefined,
      timeout: timeoutMs,
    });

    const response = await client.chat.completions.create(
      {
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        ...(options?.json ? { response_format: { type: "json_object" as const } } : {}),
      },
      { signal }
    );

    const content = response.choices[0]?.message?.content ?? "";
    return {
      content,
      model: response.model || model,
      provider: settings.provider,
      demo: false,
    };
  } catch (error) {
    if (signal.aborted) {
      throw new Error(error instanceof Error ? error.message : "LLM 请求已取消或超时");
    }
    throw error;
  } finally {
    clear();
  }
}

export async function* chatCompletionStream(
  messages: ChatMessage[],
  options?: LlmCallOptions
): AsyncGenerator<{ text?: string; model: string; demo: boolean; provider: AppSettings["provider"] }> {
  const settings = getSettings();
  const model = resolveModel(options?.modelOverride);

  if (settings.provider === "demo" || !settings.apiKey.trim()) {
    for await (const text of demoStream(messages)) {
      yield { text, model, demo: true, provider: "demo" };
    }
    return;
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { signal, clear } = withTimeoutSignal(timeoutMs, options?.signal);

  try {
    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: normalizeBaseUrl(settings.baseUrl) || undefined,
      timeout: timeoutMs,
    });

    const stream = await client.chat.completions.create(
      {
        model,
        messages,
        temperature: options?.temperature ?? 0.3,
        stream: true,
      },
      { signal }
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        yield {
          text,
          model: chunk.model || model,
          demo: false,
          provider: settings.provider,
        };
      }
    }
  } catch (error) {
    if (signal.aborted) {
      throw new Error(error instanceof Error ? error.message : "LLM 请求已取消或超时");
    }
    throw error;
  } finally {
    clear();
  }
}

export async function testLlmConnection(): Promise<{
  ok: boolean;
  message: string;
  demo: boolean;
  model: string;
}> {
  const settings = getSettings();
  const model = resolveModel();
  if (settings.provider === "demo" || !settings.apiKey.trim()) {
    return {
      ok: true,
      message:
        "当前为演示模式。请在 .env.local 设置 DEEPSEEK_API_KEY，或在本页保存 Key 后测试。",
      demo: true,
      model,
    };
  }

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: "你是连通性测试助手，只返回 JSON。" },
        { role: "user", content: '请返回 {"pong": true}' },
      ],
      { json: true, temperature: 0, timeoutMs: 20_000 }
    );
    return {
      ok: true,
      message: `连通成功（模型：${result.model}）`,
      demo: false,
      model: result.model,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "连接失败",
      demo: false,
      model,
    };
  }
}

export function isDemoMode() {
  const settings = getSettings();
  return settings.provider === "demo" || !settings.apiKey.trim();
}
