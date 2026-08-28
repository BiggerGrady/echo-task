export type DocIssue = {
  id: number;
  original: string;
  suggestion: string;
  reason: string;
  severity: "error" | "warning" | "info";
};

export type PlannedOp =
  | { type: "filter"; sheet: string; column: string; op: "eq" | "neq" | "contains"; value: string }
  | { type: "sort"; sheet: string; column: string; direction: "asc" | "desc" }
  | { type: "rename_column"; sheet: string; from: string; to: string }
  | { type: "add_column"; sheet: string; name: string; formula: "copy" | "uppercase" | "trim"; source: string }
  | { type: "keep_columns"; sheet: string; columns: string[] }
  | { type: "note"; description: string };

export type SheetSnapshot = {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
};

export type IngestedSkillDraft = {
  title: string;
  description: string;
  scope: "global" | "word" | "excel";
  content: string;
  sourceUrl: string | null;
  sourceExcerpt: string;
  demo: boolean;
};
