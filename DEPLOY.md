# Echo Task — Fly.io 公网部署

> 不需要你自己有云服务器。Fly 提供机器与 HTTPS 域名。  
> 家里的 Mac Mini 可以继续本地开发；生产跑在 Fly 上。

## 前置

1. 注册 Fly：https://fly.io/app/sign-up （可用 GitHub 登录）
2. 安装 CLI：https://fly.io/docs/hands-on/install-flyctl/
3. 登录：`fly auth login`  
   或创建 token：https://fly.io/user/personal_access_tokens

## 部署命令

在仓库根目录执行：

```bash
fly apps create echo-task-app --org personal   # 名称冲突就改 fly.toml 的 app
fly volumes create echo_task_data --region sin --size 3 -y
fly secrets set DEEPSEEK_API_KEY=你的key
fly deploy
fly apps open
```

成功后公网地址：`https://echo-task-app.fly.dev`

## 环境变量

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | 必填 |
| `DATA_ROOT` | 默认 `/data`（持久卷） |
| `LLM_MODEL` | `deepseek-v4-flash` 或 `deepseek-v4-pro` |

## 数据

SQLite、上传文件、参考文档、Skill 都在 Volume `/data`，机器重建也不会丢（只要不删 Volume）。
