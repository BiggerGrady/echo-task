# Echo Task × DeepSeek Harness

办公 Tools 的**同一份实现**在 Echo（`src/lib/office`）。Harness 通过 HTTP 调用，便于持续加需求而不分叉逻辑。

## 体验（H0）

需要 Node 22.19+ 与 `DEEPSEEK_API_KEY`：

```bash
npx @deepseek-ai/dsh web
# 默认 http://127.0.0.1:3080
```

**不要**把 dsh 端口暴露到 Cloudflare Tunnel。生产入口仍是 Echo `:3000`。

Developer Preview 会破坏性变更。建议记下本次 `npx` 拉到的版本（启动日志 / `npm view @deepseek-ai/dsh version`）。会话存储升级可能不兼容。

## 持续开发（H1 / H2）

1. 先在 Echo 增加 `src/lib/office` 能力，并用 `POST /api/office/tools` 暴露：
   - `ingest_compliance`
   - `extract_docx_text`
   - `read_xlsx_snapshot`
   - `compliance_check`
   - `add_word_comments`
   - `apply_excel_ops`
2. 本仓库 `harness/echo-office` 是 dsh 插件草稿：每个 tool `execute` 里 `fetch` Echo。
3. 启动 Echo（`npm run start:prod` 或 `npm run dev`），再：

```bash
export ECHO_TASK_URL=http://127.0.0.1:3000
export ECHO_ACCESS_PASSWORD=  # 若启用了口令
# 从 deepseek-harness 源码目录：
pnpm dsh web --patch /absolute/path/to/echo-task/harness/echo-office/cordis.patch.yml
```

`cordis.patch.yml` 里的插件路径必须是**绝对路径**。

## 产品边界

| 做 | 不做 |
|----|------|
| Echo 主 UI、鉴权、jobs、下载 | 用 dsh 替换 `/chat` |
| 合规 Skill 草稿须人工启用 | 默认开放 bash / 全盘写 |
| Harness 看 Trajectory、多步试错 | 把业务会话迁到 dsh SQLite |
