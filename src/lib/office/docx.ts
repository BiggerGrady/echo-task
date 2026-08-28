import mammoth from "mammoth";
import { injectCommentsIntoDocx, type CommentPayload } from "../documents/word-comments";
import type { DocIssue } from "./types";

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const extracted = await mammoth.extractRawText({ buffer });
  return extracted.value.trim();
}

export function parseDocIssues(raw: string): { summary: string; issues: DocIssue[]; parseOk: boolean } {
  try {
    const parsed = JSON.parse(raw) as { summary?: string; issues?: DocIssue[] };
    return {
      summary: parsed.summary ?? "校验完成",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      parseOk: true,
    };
  } catch {
    return { summary: raw.slice(0, 300), issues: [], parseOk: false };
  }
}

function severityLabel(severity: DocIssue["severity"]) {
  if (severity === "error") return "错误";
  if (severity === "warning") return "警告";
  return "建议";
}

export function issuesToComments(issues: DocIssue[], summary: string): CommentPayload[] {
  return [
    ...issues.map((issue) => {
      const locate = (issue.original || "").trim();
      return {
        locate,
        body: [
          locate ? `【定位】${locate}` : "",
          `[${severityLabel(issue.severity)}] ${issue.reason || "需修订"}`,
          issue.suggestion ? `建议：${issue.suggestion}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }),
    { locate: "", body: `【总评】${summary}` },
  ].map((c, i) => ({
    id: i,
    body: c.body,
    author: "Echo Task",
    initials: "ET",
  }));
}

export async function writeCommentedDocx(buffer: Buffer, issues: DocIssue[], summary: string) {
  const comments = issuesToComments(issues, summary);
  const annotated = await injectCommentsIntoDocx(buffer, comments);
  return { annotated, commentedCount: comments.length };
}
