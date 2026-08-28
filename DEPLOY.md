# Echo Task 部署指南（推荐：Mac Mini + Cloudflare Tunnel）

你没有云服务器、也不想绑信用卡时，用家里的 **Mac Mini 跑应用**，再用 **Cloudflare Tunnel** 得到外网 HTTPS 地址。

## 架构

```
外网用户 → Cloudflare Tunnel (HTTPS) → Mac Mini:3000 (Next.js)
数据保存在 Mac Mini 本地 data/ 目录
```

## 一、在 Mac Mini 上启动应用

```bash
# 1. 拉取代码
git clone https://github.com/BiggerGrady/echo-task.git
cd echo-task
git checkout cursor/fullstack-echo-task-dcf5   # 或合并后的 main

# 2. 配置密钥（不要提交）
cp .env.example .env.local
# 编辑 .env.local，填入：
# DEEPSEEK_API_KEY=你的key
# LLM_PROVIDER=deepseek
# LLM_MODEL=deepseek-v4-flash
# ECHO_ACCESS_PASSWORD=可选访问口令（Tunnel 外网强烈建议）

# 3. 安装依赖并生产启动
npm install
npm run build
npm run start:prod
```

浏览器访问本机：http://127.0.0.1:3000

也可用一键脚本：

```bash
chmod +x scripts/start-production.sh scripts/start-tunnel.sh
./scripts/start-production.sh
```

## 二、暴露公网（Cloudflare Tunnel，免绑卡试用）

**安全建议（必读）**

1. 生产启动默认只监听 `127.0.0.1:3000`（`npm run start:prod`），由 Tunnel 本地转发  
2. 在 `.env.local` 设置访问口令：`ECHO_ACCESS_PASSWORD=你的口令`  
3. 外网打开站点会跳转 `/login`；API 无口令返回 401  

### 方式 A：临时公网链接（最快）

另开一个终端：

```bash
# 安装 cloudflared（任选其一）
brew install cloudflare/cloudflare/cloudflared
# 或：https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

./scripts/start-tunnel.sh
# 或直接：
cloudflared tunnel --url http://127.0.0.1:3000
```

终端会打印类似：

`https://xxxx.trycloudflare.com`

这就是外网地址。Mac Mini 关机或关掉 tunnel，外网就不可用。

### 方式 B：固定域名（可选，需 Cloudflare 账号）

1. 注册 Cloudflare，把域名托管过去  
2. `cloudflared tunnel login`  
3. `cloudflared tunnel create echo-task`  
4. 配置 ingress 指向 `http://127.0.0.1:3000`  
5. 绑定 DNS：`echo.yourdomain.com` → 该 tunnel  

详见：https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

## 三、开机自启（可选）

可用 `pm2`：

```bash
npm install -g pm2
npm run build
pm2 start npm --name echo-task -- run start:prod
pm2 save
pm2 startup
```

Tunnel 可用 launchd / 单独 pm2 进程跑 `cloudflared tunnel --url http://127.0.0.1:3000`。

## 四、数据位置

都在 Mac Mini 项目目录下：

| 内容 | 路径 |
|------|------|
| 模型设置 / 参考文档 / Skill | `data/echo.db` |
| 上传原文件 | `data/uploads/` |
| 处理结果 | `data/outputs/` |
| 参考/Skill 附件 | `data/references/`、`data/skills/` |

备份：直接拷贝整个 `data/` 即可。

## 五、Docker 方式（可选）

若已安装 Docker Desktop：

```bash
cp .env.example .env.local   # 填 DEEPSEEK_API_KEY
docker compose up -d --build
cloudflared tunnel --url http://127.0.0.1:3000
```

## 附录：Fly.io（需信用卡，当前跳过）

仓库仍保留 `Dockerfile` / `fly.toml`，以后若要上云可看旧版流程；现在默认走 Mac Mini 方案。
