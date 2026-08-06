import { ConfigManager } from "@/components/ConfigManager";

export default function SkillsPage() {
  return (
    <ConfigManager
      kind="skills"
      title="Skill 配置"
      subtitle="预留 Skill 入口，配置方式与参考文档类似。启用后会注入到对应功能的模型上下文。"
    />
  );
}
