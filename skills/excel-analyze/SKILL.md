# 表格异常分析

适用：上传 Excel 后只要结论、不改原表。输出分析报告（Word），原 `.xlsx` 保持不动。

## 必须检查

1. 空值 / 缺失：按列统计空单元格比例
2. 重复行：关键列或整行重复
3. 异常值：数值列明显偏离（过大、过小、非数字）
4. 口径：同一列单位或枚举是否混用（若能从样本看出）

## 输出口径

- `finding.kind`：`missing` | `duplicate` | `outlier` | `inconsistent` | `trend` | `note`
- 每条 finding 写清 sheet、证据片段、建议动作
- 不要编造表中不存在的数字
- 结论先总评，再分条；严重级别 `error` / `warning` / `info`

## 流水线

1. `read_xlsx_snapshot` 取表头与前若干行
2. `analyze_xlsx` 出 JSON
3. `draft_docx` 写成分析报告
