# Echo Task

全栈文档与表格智能处理工作台。

## 功能

- **Agent 对话**（主入口 `/chat`）：上传 Word / Excel 或纯文本，流式过程输出，多轮上下文，本轮模型切换，新建对话
- **处理历史**：每次 Word / Excel 产物可回看下载
- **参考文档 / Skill**：注入任务上下文
- **模型入口**：DeepSeek（`deepseek-v4-flash` / `deepseek-v4-pro`）

旧入口 `/word`、`/excel` 已重定向到 `/chat`。

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
| `LLM_MODEL` | 默认 `deepseek-v4-flash`（可选 `deepseek-v4-pro`） |
| `LLM_PROVIDER` | 默认 `deepseek` |
| `ECHO_ACCESS_PASSWORD` | 可选访问口令（Tunnel 外网强烈建议） |

未配置 Key 时自动进入**演示模式**。也可在网页「模型设置」中本机填写（保存在本地 SQLite）。

## 数据

本地 SQLite 与文件保存在 `data/`（或通过 `DATA_ROOT` 指定）：

- `echo.db`：设置、参考文档、Skill、任务与会话元数据
- `uploads/` / `outputs/` / `references/` / `skills/`

## 公网部署

推荐 **Mac Mini 本机运行 + Cloudflare Tunnel**（无需云服务器/信用卡）。步骤见 [DEPLOY.md](./DEPLOY.md)。

## 设计文档（持续维护）

产品与技术方案见 [docs/DESIGN.md](./docs/DESIGN.md)。  
**之后所有功能/接口/数据结构变更都必须同步更新该文档。**
