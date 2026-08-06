/**
 * Models commonly available in Cursor's model picker.
 * Used as the primary model catalog for Echo Task's LLM entry.
 * Actual calls go through an OpenAI-compatible endpoint
 * (user-provided base URL + API key), or demo mode when unset.
 */
export type CursorModel = {
  id: string;
  label: string;
  vendor: string;
  description: string;
};

export const CURSOR_MODELS: CursorModel[] = [
  {
    id: "gpt-4o",
    label: "GPT-4o",
    vendor: "OpenAI",
    description: "Cursor 常用多模态模型，适合文档与表格理解",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    vendor: "OpenAI",
    description: "更强指令遵循，适合复杂 Excel 变换",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    vendor: "OpenAI",
    description: "更快更省，适合批量轻量校验",
  },
  {
    id: "claude-sonnet-4",
    label: "Claude Sonnet 4",
    vendor: "Anthropic",
    description: "Cursor 高频写作/审稿模型",
  },
  {
    id: "claude-opus-4",
    label: "Claude Opus 4",
    vendor: "Anthropic",
    description: "更强推理，适合复杂规则与长文档",
  },
  {
    id: "claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    vendor: "Anthropic",
    description: "稳定的文档修订与结构化输出",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    vendor: "Google",
    description: "长上下文，适合参考文档较多的任务",
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    vendor: "Google",
    description: "低延迟，适合交互式处理",
  },
  {
    id: "o3",
    label: "o3",
    vendor: "OpenAI",
    description: "深度推理，适合棘手规则校验",
  },
  {
    id: "o4-mini",
    label: "o4-mini",
    vendor: "OpenAI",
    description: "轻量推理模型",
  },
];

export function findCursorModel(id: string) {
  return CURSOR_MODELS.find((m) => m.id === id);
}
