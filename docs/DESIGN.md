# Echo Task 产品与技术方案（持续维护）

> **维护约定（强制）**  
> 1. 本文件是 Echo Task 的**唯一主设计文档**。  
> 2. 之后每次功能改动、接口变更、数据结构变更、部署方式变更，都必须同步更新本文档。  
> 3. PR 描述中需注明「已更新 `docs/DESIGN.md`」对应章节。  
> 4. 文末「变更日志」每次更新追加一条，格式：`YYYY-MM-DD | 作者/Agent | 摘要`。

---

## 1. 产品定位

Echo Task 是本地可运行的文档/表格智能处理工作台：

- 对接 DeepSeek（OpenAI 兼容）
- 支持参考文档、Skill 注入
- 结果可下载、历史可回看
- 推荐部署：Mac Mini + Cloudflare Tunnel（见 `DEPLOY.md`）

---

## 2. 当前现状（截至改版前）

### 2.1 交互形态

- 分页面表单：`/word`、`/excel`
- 一次上传 → 一次阻塞式 LLM 调用 → 返回完整 JSON → 下载文件
- 模型切换只在 `/settings`，处理页不能临时改模型
- Word 无自然语言指令框；Excel 有指令框，但不是对话

### 2.2 关键路径

| 能力 | 页面 | API | 核心逻辑 |
|------|------|-----|----------|
| Word 校验 | `src/app/word/page.tsx` | `POST /api/word/validate` | `src/lib/documents/word.ts` |
| Excel 处理 | `src/app/excel/page.tsx` | `POST /api/excel/process` | `src/lib/documents/excel.ts` |
| LLM | 设置页 | `/api/settings`、`/api/models` | `src/lib/llm/index.ts` |
| 历史 | `/history` | `/api/jobs` | `src/lib/jobs.ts` |

### 2.3 已知缺口

- **无流式输出**（`chat.completions.create` 非 stream）
- **无 Agent Chat 会话态**（jobs 是单次任务，不是多轮对话）
- **处理页无法切换模型**
- Word/Excel 体验割裂，不像「和一个助手协作」

---

## 3. 改版目标

把 Word / Excel 处理统一成 **Agent Chat** 模式：

1. 主界面是对话流（消息气泡 + 流式增量输出）
2. 底部输入区可配置：
   - 文本指令
   - 上传 Word（`.docx`）或 Excel（`.xlsx`）
   - 任务类型（自动识别 / 手动指定 word|excel）
   - 模型切换（`deepseek-v4-flash` / `deepseek-v4-pro`）
3. 模型一边思考/规划，一边流式展示过程；最终仍产出可下载文件
4. 保留参考文档 / Skill 注入、处理历史、本机数据落盘
5. **同一会话内保持多轮上下文**（DeepSeek 原生支持，应用侧必须传历史 messages）
6. **支持新建对话**：清空上下文，开启独立 session

### 3.1 DeepSeek 上下文能力确认

**结论：支持。** DeepSeek Chat API 与 OpenAI Chat Completions 兼容，通过 `messages: [{role, content}, ...]` 传递多轮历史即可保持上下文。

| 层级 | 现状 | 改版要求 |
|------|------|----------|
| DeepSeek API | 支持多轮 `messages` | 继续使用该协议 |
| Echo Task 当前代码 | Word/Excel 每次只发**单轮** user/system，**不带历史** | 必须改为带 session 历史 |
| 新建对话 | 无 | 必须支持；新 session 不继承旧上下文 |

上下文组装规则（改版后）：

1. 固定 `system`（角色说明 + 参考文档 + 启用 Skill，可按会话缓存）
2. 追加本 session 最近 N 轮 user/assistant（建议先 N=10，超长则截断更早轮次）
3. 追加本轮用户输入（含附件摘要/正文摘录）
4. 「新建对话」= 创建新 `chat_sessions`，`sessionId` 切换，messages 从空开始

### 3.2 非目标（本阶段不做）

- 多 Agent 协作编排
- 插件市场 / 远程 Skill 商店
- 用户账号体系与多租户
- 把 SQLite 换成云数据库（仍本地 `data/`）
- 跨会话自动合并记忆（仅显式同一会话内保持上下文）

---

## 4. 目标体验（UX）

### 4.1 信息架构

```
侧栏
├── 对话（新主入口，替代 /word + /excel 作为默认处理台）
├── 处理历史
├── 参考文档
├── Skill 配置
└── 模型设置（全局默认；对话内可临时覆盖）
```

建议：

- 新增 `/chat` 作为主处理台
- `/word`、`/excel` 第一阶段可重定向到 `/chat`（带 `?type=word|excel`），避免双入口混乱
- 首页 CTA 指向「开始对话」

### 4.2 对话区布局（一屏一职责）

```
┌─────────────────────────────────────────────┐
│ [新建对话] 会话标题 / 会话列表  当前模型标签   │
├─────────────────────────────────────────────┤
│                                             │
│  助手：流式输出过程、中间状态、最终摘要       │
│  用户：文本 + 附件卡片                       │
│  系统：文件就绪、下载按钮、错误提示           │
│                                             │
├─────────────────────────────────────────────┤
│ [类型▾] [模型▾] [附件]  输入框……    [发送]   │
└─────────────────────────────────────────────┘
```

「新建对话」行为：

- 立即创建新 `sessionId` 并切换过去
- 消息区清空；后续请求不再携带旧 session 的 messages
- 旧会话仍可从会话列表重新打开（上下文仍在）

输入区控件：

| 控件 | 行为 |
|------|------|
| 类型 | `auto` / `word` / `excel`；有附件时按扩展名自动推断，可手动覆盖 |
| 模型 | 本轮请求覆盖；不改永久默认，除非用户点「设为默认」 |
| 附件 | 单文件优先（MVP）；展示文件名/大小，可清除 |
| 发送 | 无文件且无文本时禁用；Word 允许「仅文件」；Excel 建议「文件+指令」 |

### 4.3 流式消息内容建议

助手消息分阶段展示（同一条消息内分段更新）：

1. `status`：解析文件 / 加载参考文档与 Skill / 调用模型  
2. `delta`：模型文本流（思考摘要、检查要点、计划步骤）  
3. `result`：结构化结果卡片（问题数、操作数、下载按钮）  
4. `error`：失败原因（可重试）

---

## 5. 技术方案

### 5.1 总体架构

```
Browser Chat UI
   │  POST /api/chat (multipart 或先上传再 JSON)
   │  Accept: text/event-stream
   ▼
Chat Orchestrator (server)
   ├─ 解析附件 + 类型 + 模型覆盖
   ├─ 注入 references / skills
   ├─ LLM stream (DeepSeek OpenAI-compatible)
   ├─ 解析/执行（Word 批注 / Excel 变换）
   ├─ 落盘 uploads/outputs + jobs/sessions
   └─ SSE 事件推送前端
```

### 5.2 LLM 流式

改造 `src/lib/llm/index.ts`：

- 新增 `chatCompletionStream(...)`
- 使用 OpenAI SDK `stream: true`
- 支持可选参数：`modelOverride?: string`
- Demo 模式：模拟分片 `delta`，保证无 Key 也能演示流式 UI

事件协议（SSE，建议 `event` + JSON `data`）：

```text
event: meta
data: {"sessionId":"...","jobId":"...","type":"word","model":"deepseek-v4-flash"}

event: status
data: {"stage":"extracting","message":"正在提取 Word 正文…"}

event: delta
data: {"text":"发现可能问题："}

event: result
data: {"summary":"...","downloadUrl":"/api/download/...","issues":[...]} 

event: error
data: {"message":"..."}

event: done
data: {"ok":true}
```

### 5.3 会话与历史数据模型

在现有 `jobs` 之上增加会话（推荐）：

```sql
-- 会话
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 消息
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,          -- user | assistant | system
  content TEXT NOT NULL DEFAULT '',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  meta_json TEXT NOT NULL DEFAULT '{}', -- model/type/jobId 等
  created_at TEXT NOT NULL
);
```

关系：

- 一轮用户请求可生成 1 条 user message + 1 条 assistant message
- 若产生文件产物，仍写 `jobs` 表，并在 assistant `meta_json.jobId` 关联
- `/history` 继续以 jobs 为「产物历史」；后续可加「会话历史」入口

### 5.4 API 规划

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/chat` | 主入口，SSE 流式处理 |
| `GET` | `/api/chat/sessions` | 会话列表 |
| `GET` | `/api/chat/sessions/[id]` | 会话消息 |
| `DELETE` | `/api/chat/sessions/[id]` | 删除会话 |
| 保留 | `/api/word/validate`、`/api/excel/process` | 过渡期兼容，标记 deprecated |

`POST /api/chat` 请求字段（multipart）：

- `message`：文本
- `file`：可选附件
- `type`：`auto|word|excel`
- `model`：可选覆盖
- `sessionId`：可选，空则新建

### 5.5 前端改造要点

- 新增 `src/app/chat/page.tsx` + `src/components/chat/*`
- Composer：类型、模型、附件、输入、发送
- MessageList：支持流式拼接 `delta`
- 使用 `fetch` + `ReadableStream` / `EventSource`（multipart 场景优先 fetch stream）
- 发送中锁定输入；支持停止生成（MVP 可后置）

### 5.6 Word / Excel 处理逻辑复用

- **不要重写** `word.ts` / `excel.ts` 的核心产物逻辑
- 抽一层 orchestrator：
  1. 流式让模型先输出「可读过程文本」
  2. 再要求/解析最终 JSON（可用第二段调用，或同一流中约定 JSON fence）
  3. 执行现有批注注入 / Excel 操作
- MVP 推荐两段式，稳定性更高：
  - Turn A（stream）：自然语言过程
  - Turn B（json）：结构化计划/问题列表（可非 stream）

### 5.7 模型切换策略

- 全局默认：仍存 settings
- 对话内选择：仅影响当前请求（query/body `model`）
- UI 显示：顶部 chip「本轮：deepseek-v4-pro」
- 可选后续：消息级记录实际使用模型，便于审计

---

## 6. 实施分期

### Phase 1 — 可对话 + 可流式 + 上下文 + 新建对话（优先）

- [ ] 新增 `/chat` 页面与 Composer
- [ ] `chatCompletionStream` + `/api/chat` SSE
- [ ] **sessions/messages 落库**；请求时携带本会话历史 messages
- [ ] **新建对话**按钮（新 session，上下文隔离）
- [ ] 会话列表（至少能切换最近会话）
- [ ] Word/Excel 处理：上传+指令 → 流式过程 → 产物下载
- [ ] 模型下拉覆盖本轮请求
- [ ] 写入 jobs（兼容现有历史页）
- [ ] `/word`、`/excel` 跳转 `/chat`

### Phase 2 — 会话体验增强

- [ ] 更完整的会话侧栏（重命名、删除、搜索）
- [ ] 上下文窗口策略可视化（已纳入 N 轮 / 已截断提示）
- [ ] 同会话多文件引用

### Phase 3 — 体验增强

- [ ] 停止生成
- [ ] 流式过程中展示引用了哪些参考文档/Skill
- [ ] 失败自动重试 / 改用另一模型

---

## 7. 风险与对策

| 风险 | 对策 |
|------|------|
| 模型边说边输出合法 JSON 不稳定 | 两段式：先 stream 文本，再 json 调用 |
| 大文件 + 长上下文超限 | 继续截断正文/表格快照；提示用户缩小范围 |
| SSE 被代理缓冲 | 关闭缓冲、定期 ping；Cloudflare Tunnel 下验证 |
| 旧页面用户书签失效 | 保留路由重定向至少一个版本 |

---

## 8. 验收标准（Phase 1）

1. 在 `/chat` 上传 Word，能看到流式过程文本，最终可下载带批注 docx  
2. 在 `/chat` 上传 Excel + 指令，同样流式过程，最终可下载 xlsx  
3. 输入区可切换 `deepseek-v4-flash` / `deepseek-v4-pro`，实际请求使用所选模型  
4. 参考文档 / 启用 Skill 仍注入提示词  
5. 处理后在「处理历史」可看到记录并下载原文/结果  
6. 无 API Key 时 demo 模式也能演示流式 UI  
7. **同一会话连续追问时，模型能利用此前轮次上下文**（例如「按刚才的规则再处理一次」）  
8. **点击「新建对话」后，新会话不再带上旧上下文**；旧会话可再打开恢复  

---

## 9. 文档与代码同步清单

每次改动请核对：

- [ ] 更新本文「现状 / 方案 / 分期 / 变更日志」
- [ ] 若影响部署，更新 `DEPLOY.md`
- [ ] 若影响启动脚本，更新 `README.md`
- [ ] 新增环境变量时更新 `.env.example`

---

## 10. 变更日志

| 日期 | 作者 | 摘要 |
|------|------|------|
| 2026-08-11 | Cursor Agent | 确认 DeepSeek 支持多轮 messages 上下文；将「会话上下文 + 新建对话」提升为 Phase 1 必做 |
| 2026-08-11 | Cursor Agent | 初版：确立 Agent Chat + 流式输出改版方向、架构、分期与维护约定 |
