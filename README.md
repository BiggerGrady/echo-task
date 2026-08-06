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

## 模型说明（DeepSeek 默认）

默认供应商为 [DeepSeek](https://api.deepseek.com)（OpenAI 兼容）。**不要把 API Key 发到聊天或提交进 Git。**

在项目根目录创建 `.env.local`：

```bash
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY=...
```

常用变量：

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek Key（推荐） |
| `LLM_BASE_URL` | 默认 `https://api.deepseek.com` |
| `LLM_MODEL` | 默认 `deepseek-chat`（也可用 `deepseek-reasoner`） |
| `LLM_PROVIDER` | 默认 `deepseek` |

未配置 Key 时自动进入**演示模式**。也可在网页「模型设置」中本机填写（保存在本地 SQLite）。

## 数据

本地 SQLite 与文件保存在 `data/`：

- `echo.db`：设置、参考文档、Skill、任务元数据
- `uploads/` / `outputs/` / `references/` / `skills/`
