import OpenAI from "openai";
import { getSettings, type AppSettings } from "../db";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmResult = {
  content: string;
  model: string;
  provider: AppSettings["provider"];
  demo: boolean;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function demoComplete(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const system = messages.find((m) => m.role === "system")?.content ?? "";

  if (system.includes("语法") || system.includes("grammar") || lastUser.includes("待校验正文")) {
    const body = lastUser.includes("## 待校验正文")
      ? lastUser.split("## 待校验正文").pop() ?? lastUser
      : lastUser;
    const sentences = body
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4)
      .slice(0, 5);

    const issues = sentences.map((text, i) => ({
      id: i + 1,
      original: text.slice(0, 120),
      suggestion: text.slice(0, 120),
      reason: "演示模式：请配置 DeepSeek API Key 后获取真实语法建议",
      severity: i % 2 === 0 ? "warning" : "info",
    }));

    return JSON.stringify({
      summary: "当前为演示模式。未配置 API Key 时不会真实调用大模型。",
      issues,
    });
  }

  if (system.includes("Excel") || lastUser.includes("excel") || lastUser.includes("表格")) {
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

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; json?: boolean }
): Promise<LlmResult> {
  const settings = getSettings();

  if (settings.provider === "demo" || !settings.apiKey.trim()) {
    return {
      content: demoComplete(messages),
      model: settings.model,
      provider: "demo",
      demo: true,
    };
  }

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: normalizeBaseUrl(settings.baseUrl) || undefined,
  });

  const response = await client.chat.completions.create({
    model: settings.model,
    messages,
    temperature: options?.temperature ?? 0.2,
    ...(options?.json ? { response_format: { type: "json_object" as const } } : {}),
  });

  const content = response.choices[0]?.message?.content ?? "";
  return {
    content,
    model: response.model || settings.model,
    provider: settings.provider,
    demo: false,
  };
}

export async function testLlmConnection(): Promise<{
  ok: boolean;
  message: string;
  demo: boolean;
  model: string;
}> {
  const settings = getSettings();
  if (settings.provider === "demo" || !settings.apiKey.trim()) {
    return {
      ok: true,
      message:
        "当前为演示模式。请在 .env.local 设置 DEEPSEEK_API_KEY，或在本页保存 Key 后测试。",
      demo: true,
      model: settings.model,
    };
  }

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: "你是连通性测试助手，只返回 JSON。" },
        { role: "user", content: '请返回 {"pong": true}' },
      ],
      { json: true, temperature: 0 }
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
      model: settings.model,
    };
  }
}
