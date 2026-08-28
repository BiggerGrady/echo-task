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

## 2. 当前现状（截至 Agent Chat Phase 1）

### 2.1 交互形态

- 主入口：`/chat`（Agent 对话：流式 SSE、会话上下文、新建对话、本轮模型覆盖）
- `/word`、`/excel` 重定向到 `/chat?type=word|excel`
- 全局默认模型仍在 `/settings`；对话内可临时覆盖本轮模型
- 无 API Key 时 Demo 模式可演示流式 UI

### 2.2 关键路径

| 能力 | 页面 | API | 核心逻辑 |
|------|------|-----|----------|
| Agent Chat | `src/app/chat/` | `POST /api/chat`（SSE） | `src/lib/chat/orchestrator.ts` |
| 会话 | 对话侧栏 | `/api/chat/sessions` | `src/lib/chat/sessions.ts` |
| Word / Excel（兼容） | 重定向 | `POST /api/word/validate`、`/api/excel/process`（deprecated） | `src/lib/documents/*` |
| LLM | 设置页 + 对话覆盖 | `/api/settings`、`/api/models` | `src/lib/llm/index.ts`（含 stream + 超时） |
| 历史 | `/history` | `/api/jobs` | `src/lib/jobs.ts` |
| 访问口令 | `/login` | `/api/auth/*` | `src/lib/auth.ts` + `src/middleware.ts` |

### 2.3 已知缺口（Phase 2+）

- 停止生成、会话重命名/搜索
- 上下文窗口可视化
- 历史分页与磁盘清理策略
- API Key 仍明文存 SQLite（外网优先用 `.env.local`）

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

- [x] 新增 `/chat` 页面与 Composer
- [x] `chatCompletionStream` + `/api/chat` SSE
- [x] **sessions/messages 落库**；请求时携带本会话历史 messages
- [x] **新建对话**按钮（新 session，上下文隔离）
- [x] 会话列表（至少能切换最近会话）
- [x] Word/Excel 处理：上传+指令 → 流式过程 → 产物下载
- [x] 模型下拉覆盖本轮请求
- [x] 写入 jobs（兼容现有历史页）
- [x] `/word`、`/excel` 跳转 `/chat`
- [x] **基础安全**：默认绑定 localhost；可选访问口令（Tunnel 场景）
- [x] **可靠调用**：LLM 超时/取消；上传大小限制；截断提示
- [x] Demo 模式发送前可见提示

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
| 大文件 + 长上下文超限 | 继续截断正文/表格快照；**明确提示已截断** |
| SSE 被代理缓冲 | 关闭缓冲、定期 ping；Cloudflare Tunnel 下验证 |
| 旧页面用户书签失效 | 保留路由重定向至少一个版本 |
| Tunnel 公网暴露无鉴权 | Phase 1 同期加访问口令 / 仅绑定 localhost |
| LLM 长时间无响应 | 超时、Abort、前端可取消 |

---

## 8. 体验与架构 Review（2026-08-11）

对照现网实现 + Chat 改版需求的审查结论。优先级：P0 必做 / P1 应做 / P2 可增强。

### 8.1 P0（上线前或 Chat Phase 1 同期必做）

| # | 问题 | 建议 |
|---|------|------|
| 1 | Cloudflare Tunnel 公网暴露后，API **无鉴权**（设置/上传/下载/历史均可被访问） | 增加简单访问口令或 Basic Auth；生产默认只监听 `127.0.0.1`，Tunnel 本地转发 |
| 2 | API Key 可被未授权 `PUT /api/settings` 覆盖，且明文存 SQLite | 外网场景优先只用 `.env.local`；设置页写 Key 需鉴权 |
| 3 | 下载接口可凭文件名取 uploads/outputs | 必须带 `jobId`/`session` 校验；取消裸文件名下载 |
| 4 | LLM **无超时/取消**，请求可能一直转圈，job 卡在 `pending` | `timeout` + `AbortSignal`；启动时清理超时 pending |
| 5 | 上传无体积上限，整文件进内存 | 限制如 20–32MB；超限前端拦截 |
| 6 | 正文/表格被静默截断，用户不知情 | 返回并展示「已截断」提示 |
| 7 | Chat Phase 1 能力尚未落地（流式/会话/新建对话/模型覆盖） | 按 §6 Phase 1 实施 |

### 8.2 P1（显著提升体验）

| # | 问题 | 建议 |
|---|------|------|
| 1 | 处理中只有「处理中…」，无阶段进度 | 对齐 SSE `status`：解析 → 注入知识 → 模型 → 写文件 |
| 2 | Word 不能附带自然语言指令，与 Excel 不一致 | Chat Composer 统一支持「文件 + 文本」 |
| 3 | Excel 预览用的是**处理前**快照 | 展示处理后预览 + 实际执行的 operations |
| 4 | Demo 模式不够醒目 | 发送前横幅提示「演示模式」 |
| 5 | 拖拽不校验类型/大小 | FileDropzone 客户端校验 |
| 6 | 历史无分页、无自动清理，磁盘会涨 | 分页 + 保留策略（如 30 天）+ 失败任务清扫 |
| 7 | 参考文档/Skill 在处理页不可见「本次会注入哪些」 | Chat 过程中展示注入清单 |
| 8 | 模型 JSON 解析失败被当成空结果成功 | 明确失败并可重试 |
| 9 | Word 批注定位失败时静默挂文末 | UI 区分「命中批注 / 回退批注」数量 |
| 10 | 路由 jobId 与文件名内 UUID 双重生成 | 统一使用 DB jobId |
| 11 | 设置页「测试连通」不用输入框未保存的 Key | 测试前先用当前输入，或提示先保存 |

### 8.3 P2（锦上添花）

- 停止生成、失败换模型重试
- 会话侧栏重命名/搜索、上下文「已纳入 N 轮」提示
- 健康检查、磁盘占用告警、`data/` 备份说明
- 正式 Cloudflare 命名 Tunnel（固定域名）替代临时 trycloudflare
- Excel 能力边界说明（当前支持 filter/sort/rename/add/keep 等）
- SQLite 索引与定期维护

### 8.4 建议实施顺序

1. **安全与可靠**：本地绑定 + 口令、超时、上传限额、下载鉴权  
2. **Chat Phase 1**：流式 + 会话上下文 + 新建对话 + 模型覆盖  
3. **体验打磨**：进度阶段、截断提示、预览正确性、注入可见性、历史清理  

---

## 9. 验收标准（Phase 1）

1. 在 `/chat` 上传 Word，能看到流式过程文本，最终可下载带批注 docx  
2. 在 `/chat` 上传 Excel + 指令，同样流式过程，最终可下载 xlsx  
3. 输入区可切换 `deepseek-v4-flash` / `deepseek-v4-pro`，实际请求使用所选模型  
4. 参考文档 / 启用 Skill 仍注入提示词  
5. 处理后在「处理历史」可看到记录并下载原文/结果  
6. 无 API Key 时 demo 模式也能演示流式 UI  
7. **同一会话连续追问时，模型能利用此前轮次上下文**（例如「按刚才的规则再处理一次」）  
8. **点击「新建对话」后，新会话不再带上旧上下文**；旧会话可再打开恢复  
9. 大文件/长文出现时有截断提示；LLM 超时有明确错误而非无限转圈  
10. Tunnel 场景下至少具备访问口令或等价防护  

---

## 11. DeepSeek Harness 接入设计（2026-08-28）

> 目标：在「日常办公多场景 Agent」方向上，明确 Harness **是否用、怎么用、先写什么代码、哪些用自然语言**。  
> 结论：**不替换**现有 Echo Task Next.js 主产品；以 **sidecar + 文档工具插件包** 方式接入，把可复用能力沉淀为 Tools。

### 11.1 Harness 近期更新（相对 2026-08-11 讨论时）

| 时间 | 版本 | 对 Echo Task 的含义 |
|------|------|---------------------|
| 08-13 | v0.1 公开 | 开发者预览；`npx @deepseek-ai/dsh web`；一切皆插件 |
| 08-17 | v0.1.0-rc.7 | 插件可注册设置页；Code mode → **PTC mode**；DeepSeek `low` 推理力度 |
| 08-19 | v0.1.0-rc.8 | **多模态图片**；Claude Code/Codex 可作子代理 Bundle；**SQLite 会话存储格式不兼容** |
| 08-21 | v0.1.1-rc.1/rc.2 | `DeepSeek-V4-Flash-Vision-Exp`；沙箱逃逸修复；图片 Files API |
| 08-27 | **v0.1.2-alpha.1**（当前最新） | 子代理可选模型；ACP 能力补齐；公网 Web 需一次性 token；Headless stderr 进度 / stdout 终态；**明确未做安全审计** |

仍处于 **Developer Preview**：插件 API / 存储可能破坏性变更；**不要把 Harness 当生产唯一依赖**。适合实验台 + 工具预研，稳定业务仍走 Echo Task 自研编排。

官方入口：

- 站点：https://www.deepseek.com/harness/
- 仓库：https://github.com/deepseek-ai/deepseek-harness
- 文档：https://deepseek-harness.github.io/deepseek-harness/

### 11.2 产品定位（日常工作 → Agent）

用户日常不是「只有 Word/Excel 两个按钮」，而是一篮子任务：

| 场景 | 典型一句话 | 主要产物 |
|------|------------|----------|
| 写报告 | 「根据这两份材料和上周数据，起草周报」 | `.docx` / `.md` |
| 写 PPT | 「把报告改成 8 页汇报稿大纲，再生成 pptx」 | `.pptx` |
| 语法/质量校验 | 「校对这篇，问题打批注」 | 带批注 `.docx` |
| 合规校验 | 「按《××规范》查缺漏、敏感词、格式」 | 批注 + 合规清单 |
| Excel 分析 | 「按部门汇总，找出异常，出结论」 | 分析说明 + 可选 `.xlsx` |
| Excel 处理 | 「筛选研发、排序、另存」 | 处理后 `.xlsx` |

**产品叙事**：Echo Task = 本机「办公文档 Agent 工作台」；Harness = 可选的 **Agent 运行时实验层**，用来跑多步工具循环与 Trajectory；主站仍负责上传、历史、鉴权、下载。

### 11.3 推荐架构：Sidecar，不整仓替换

```text
用户
 ├─ Echo Task Web（Next.js，:3000）     ← 主入口：会话 UI、鉴权、jobs、下载
 │     POST /api/chat 或 /api/agent/*
 │
 ├─ 路径 A（默认，稳）
 │     Echo Orchestrator（现有）
 │     → DeepSeek Chat API
 │     → 自研 Word/Excel 逻辑 → data/outputs
 │
 └─ 路径 B（实验 / 复杂多步，可选）
       DeepSeek Harness（dsh，:3080 或 headless）
       → Profile: echo-office
       → Tools 插件（封装同一套文档库）
       → Trajectory 可回放
       → 产物回写 data/outputs，经 Echo 下载
```

| 决策 | 选择 | 原因 |
|------|------|------|
| 是否 fork 进 monorepo 替换 Next | **否** | Preview 变更快；你们已有 Chat/鉴权/落盘 |
| 是否直接 `npx dsh web` 当唯一产品 | **否**（可作个人试用） | 默认偏编码 Agent；缺业务下载/历史/Tunnel 口令 |
| 是否写 dsh 插件包 | **是（Phase H）** | 把业务能力变成 Tools，Harness 与 Echo 都能调同一实现 |
| 进程关系 | Mac Mini 上 **两进程** 或按需启 headless | Tunnel 仍指 Echo；dsh 默认仅 localhost |

### 11.4 开发分工：代码 vs 自然语言

| 层级 | 形态 | 谁写 | 例子 |
|------|------|------|------|
| **Tools** | **TypeScript 代码** | 开发者 | `extract_docx`、`add_comments`、`analyze_xlsx`、`render_pptx` |
| **Skills / 系统提示** | **自然语言 + 少量结构化** | 业务/开发者 | 「周报结构」「合规检查清单」「PPT 页序规范」 |
| **Profile / patch** | YAML 配置 | 开发者 | 文档模式只挂办公 tools，禁用任意 shell 或收紧审批 |
| **护栏** | 配置 + 策略代码 | 开发者 | 工作目录、上传上限、审批改文件、超时 |

原则：**场景用自然语言描述；能力用代码实现；同一 Tool 服务多个场景。**

### 11.5 工具清单（按场景，优先复用）

#### A. 已有 / 易从 Echo Task 抽出（先做）

| Tool | 代码来源 | 服务场景 |
|------|----------|----------|
| `extract_docx_text` | `documents/word` + mammoth | 报告、校对、合规 |
| `add_word_comments` | `word-comments` | 校对、合规 |
| `read_xlsx_snapshot` | `documents/excel` | 分析、处理、写报告取材 |
| `apply_excel_ops` | excel operations | 表格处理 |
| `list_references` / `get_skill` | references/skills | 全场景规范注入 |
| `save_output` | paths + jobs | 统一落盘与历史 |

#### B. 日常新增（第二批）

| Tool | 说明 | 场景 |
|------|------|------|
| `draft_docx` | 按大纲/模板生成或改写 docx | 写报告 |
| `compliance_check` | 规则表 + LLM：缺项/敏感词/格式 → issues JSON | 合规校验 |
| `analyze_xlsx` | 统计、分组、异常点 → 结构化结论（可不改表） | Excel 分析 |
| `outline_pptx` | 只出幻灯片大纲 JSON（页标题/要点） | 写 PPT（MVP） |
| `render_pptx` | 大纲 → `.pptx`（可用 pptxgenjs 等） | 写 PPT |
| `merge_sources` | 多文件摘录合并为写作上下文 | 报告/PPT |

#### C. 明确后置 / 慎用

| 能力 | 建议 |
|------|------|
| 任意 `bash` / 全盘写文件 | 文档 Profile **默认关闭或强审批** |
| 视觉模型读截图/扫描件 | 可用 V4-Flash-Vision；合规扫描件场景再开 |
| Claude Code / Codex 子代理 | 与办公主路径无关，可不装 |

### 11.6 Skills（自然语言）示例

放在 Echo `skills/` 或 dsh skill 插件，**不替代 Tools**：

- `skill-weekly-report`：周报章节、语气、必须引用数据表字段  
- `skill-compliance-公文`：条款清单、禁止表述、格式红线  
- `skill-pptx-internal`：页数上限、每页要点数、封面/目录/结尾  
- `skill-excel-anomaly`：何谓异常、如何表述结论  

Agent 流程期望：

```text
用户目标 →（Skill 约束）→ 选 Tools → 多步执行 → 产物 + 摘要
（Harness 下另有 Trajectory；Echo 下用 SSE status/delta/result）
```

### 11.7 接入分期（Harness = Phase H，与 Chat Phase 并行）

| 阶段 | 做什么 | 产出 | 风险 |
|------|--------|------|------|
| **H0 体验** | 本机 `npx @deepseek-ai/dsh web`，固定版本笔记；不接业务 | 团队对 Trajectory/PTC 有体感 | 低 |
| **H1 抽库** | 把 Word/Excel/落盘抽成 `packages/office-core`（或 `src/lib/office/*`），Echo 与未来 dsh 插件共用 | 一份代码两处可调 | 中 |
| **H2 插件** | 做 `@echo-task/dsh-office` bundle：注册 A 类 tools；`echo-office` profile 裁剪编码工具 | `dsh web --patch` 能校对/改表 | 中高（API 变） |
| **H3 桥接** | Echo「高级 Agent」开关 → headless/ACP 调 dsh；产物回 `jobs` | 复杂多步走 Harness，简单单步仍走 Orchestrator | 高 |
| **H4 扩展** | `draft_docx` / `compliance_check` / `outline_pptx`+`render_pptx` / `analyze_xlsx` | 覆盖报告·PPT·合规·分析 | 中 |

**当前建议执行序**：先完成/巩固 Echo Chat Phase 1 → **H0+H1** → 有余力再 H2；未稳定前不要 H3 作为默认路径。

### 11.8 与「只做自然语言」的边界

| 说法 | 对不对 |
|------|--------|
| 「把场景写成 Prompt 就能出报告/PPT」 | **不够**；生成/改文件必须有 Tool 代码 |
| 「每个场景都要重写一套系统」 | **错**；场景差在 Skill，能力差在 Tool |
| 「Harness 装上就自动会做合规」 | **错**；合规规则与 `compliance_check` 要你们定义 |

### 11.9 验收（Harness 实验路径）

1. H0：本机 dsh 能用 DeepSeek Key 完成一次本地文件任务并看到 Trajectory  
2. H1：Echo 与插件调用同一 `add_word_comments` 实现，产物一致  
3. H2：仅办公 tools 的 profile 下，自然语言完成「校对 docx + 筛选 xlsx」  
4. H3（可选）：Echo UI 触发的一次 headless 任务能在历史页下载结果  
5. 升级 dsh 小版本后插件仍能加载（或有明确 pin 版本说明）

### 11.10 风险（Harness 专表）

| 风险 | 对策 |
|------|------|
| Preview 破坏性变更 / 会话库不兼容 | pin 版本；业务会话仍以 Echo SQLite 为准 |
| 沙箱未审计 | 文档 Profile 收紧工具；外网 Tunnel 不直接暴露 dsh |
| 默认编码 Agent 过权 | 自定义 preset，去掉或审批 shell |
| 双系统心智负担 | UI 默认只暴露 Echo；Harness 标「实验」 |

---

## 12. 文档与代码同步清单

每次改动请核对：

- [ ] 更新本文「现状 / 方案 / 分期 / Review / Harness / 变更日志」
- [ ] 若影响部署，更新 `DEPLOY.md`
- [ ] 若影响启动脚本，更新 `README.md`
- [ ] 新增环境变量时更新 `.env.example`

---

## 13. 变更日志

| 日期 | 作者 | 摘要 |
|------|------|------|
| 2026-08-28 | Cursor Agent | 增补 §11：Harness 更新至 v0.1.2-alpha.1；日常办公多场景 sidecar 接入设计、Tools/Skills 分工与 H0–H4 分期 |
| 2026-08-11 | Cursor Agent | Phase 1 落地：`/chat` SSE、会话上下文、新建对话、口令鉴权、下载需 jobId、上传限额、LLM 超时、localhost 绑定；更新 README/DEPLOY |
| 2026-08-11 | Cursor Agent | Review：补充 P0/P1/P2 优化清单，调整风险与验收（鉴权、超时、截断提示等） |
| 2026-08-11 | Cursor Agent | 确认 DeepSeek 支持多轮 messages 上下文；将「会话上下文 + 新建对话」提升为 Phase 1 必做 |
| 2026-08-11 | Cursor Agent | 初版：确立 Agent Chat + 流式输出改版方向、架构、分期与维护约定 |
