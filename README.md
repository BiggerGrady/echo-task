# Echo Task

全栈文档与表格智能处理工作台。

## 功能

- **文档校验**：上传 Word（`.docx`），语法检查并下载标注报告
- **Excel 处理**：自然语言指令 + Excel 输入，输出处理后的 `.xlsx`
- **参考文档**：全局 / 功能级长期知识维护，自动注入任务上下文
- **Skill 配置**：与参考文档类似的 Skill 入口，可启用/停用
- **模型入口**：以 Cursor 可用模型列表为目录，通过 OpenAI 兼容协议调用

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 模型说明

Cursor 不直接提供可被外部服务调用的模型 HTTP API。本项目：

1. 在「模型设置」中提供 Cursor 常用模型清单作为选择入口
2. 通过 `Base URL + API Key` 对接 OpenAI 兼容供应商
3. 未配置 Key 时自动进入**演示模式**，页面与流程仍可跑通

## 数据

本地 SQLite 与文件保存在 `data/`：

- `echo.db`：设置、参考文档、Skill、任务元数据
- `uploads/` / `outputs/` / `references/` / `skills/`
