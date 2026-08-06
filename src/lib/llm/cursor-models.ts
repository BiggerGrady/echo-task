/**
 * Supported LLM models for Echo Task.
 * Currently only DeepSeek V4 variants are selectable.
 */
export type CatalogModel = {
  id: string;
  label: string;
  vendor: string;
  description: string;
};

export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    vendor: "DeepSeek",
    description: "更快更省，适合日常文档校验与 Excel 处理",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    vendor: "DeepSeek",
    description: "更强效果，适合复杂规则与长文档",
  },
];

export const SUPPORTED_MODEL_IDS = MODEL_CATALOG.map((m) => m.id);

/** @deprecated use MODEL_CATALOG */
export const CURSOR_MODELS = MODEL_CATALOG;

export function findCatalogModel(id: string) {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function normalizeModelId(model: string | undefined | null, fallback = "deepseek-v4-flash") {
  if (model && SUPPORTED_MODEL_IDS.includes(model)) return model;
  return fallback;
}
