# 内部汇报 PPT

适用：周报、项目进展、汇报材料。先出大纲 JSON，再渲染可编辑 `.pptx`（16:9）。

## 结构（默认）

1. 封面：标题 + 场合（内部汇报）
2. 目录或问题/目标（1 页）
3. 主体 4–8 页：每页一个观点
4. 结论 / 下一步
5. 结束页

## 版式（layout）

- `cover` 封面
- `section` 章节过渡（大标题）
- `bullets` 要点（每页 ≤6 条，每条 ≤20 字）
- `two_column` 对比/并列
- `closing` 结束

## 文案约束

- 标题短，不写长句当标题
- 数字尽量带来源（若材料中有）
- 不使用绝对化宣传（第一、绝对、100% 除非材料写明）
- 不塞满整页；宁可少字

## 流水线

1. 收集用户指令与附件摘录
2. 调用大纲（`outline_pptx`）得到 JSON
3. 人工可改大纲后再渲染（`render_pptx`）
4. 下载 `.pptx`，在 PowerPoint / WPS 中再调格式

## 来源说明

本 Skill 吸收社区 DSH 插件 [dsh-ppt](https://github.com/STARDUSTLC666/dsh-ppt) 的「一句话 → 结构化 slides → 导出 PPTX」SOP，以及 pptwise / pptx-from-layouts「大纲与渲染分离」的思路。  
Echo Task 使用本仓库 `src/lib/office/pptx.ts`（pptxgenjs）渲染，**不绑定** dsh 运行时；Harness 侧可通过 `POST /api/office/tools` 复用。
