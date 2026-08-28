import { chatCompletion } from "../llm";
import { buildSkillContext } from "../skills";
import type { DocIssue } from "./types";
import { parseDocIssues } from "./docx";

export async function checkCompliance(input: {
  text: string;
  fileName: string;
  instruction?: string;
  skillOverride?: string;
}): Promise<{ summary: string; issues: DocIssue[]; parseOk: boolean; model: string; demo: boolean }> {
  const skills = input.skillOverride?.trim() || buildSkillContext("word");
  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `你是文档合规审查员。只根据给定的合规 Skill / 清单检查正文，不要发明清单外的硬性条款。只返回 JSON：
{"summary":"总评","issues":[{"id":1,"original":"原文连续片段","suggestion":"如何改到符合条款","reason":"对应检查项/条款","severity":"error|warning|info"}]}
original 必须尽量是正文中真实出现的连续片段，便于挂批注。`,
      },
      {
        role: "user",
        content: `文件：${input.fileName}
用户说明：${input.instruction || "请按合规 Skill 检查"}

## 合规 Skill
${skills}

## 正文
${input.text}`,
      },
    ],
    { json: true, temperature: 0.1 }
  );
  const parsed = parseDocIssues(result.content);
  return { ...parsed, model: result.model, demo: result.demo };
}
