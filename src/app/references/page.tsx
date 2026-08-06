import { ConfigManager } from "@/components/ConfigManager";

export default function ReferencesPage() {
  return (
    <ConfigManager
      kind="references"
      title="参考文档"
      subtitle="长期维护知识材料。可设为全局，或仅作用于文档校验 / Excel 处理。"
    />
  );
}
