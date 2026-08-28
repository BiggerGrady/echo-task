import { ConfigManager } from "@/components/ConfigManager";

export default function SkillsPage() {
  return (
    <ConfigManager
      kind="skills"
      title="Skill 配置"
      subtitle="内置「内部汇报 PPT」「周报结构」「表格异常分析」；也可从制度链接或粘贴文案生成合规草稿。启用后注入对应功能。"
    />
  );
}
