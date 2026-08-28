import { ConfigManager } from "@/components/ConfigManager";

export default function SkillsPage() {
  return (
    <ConfigManager
      kind="skills"
      title="Skill 配置"
      subtitle="内置「内部汇报 PPT」Skill；也可从制度链接或粘贴文案生成合规草稿。启用后会注入到对应功能的模型上下文。"
    />
  );
}
