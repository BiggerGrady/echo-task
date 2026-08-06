#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
TARGET="http://127.0.0.1:${PORT}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "未安装 cloudflared。"
  echo "macOS 推荐：brew install cloudflare/cloudflare/cloudflared"
  echo "文档：https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
  exit 1
fi

echo "请确认本机已在运行 Echo Task（${TARGET}）"
echo "即将创建临时公网 HTTPS 隧道…"
exec cloudflared tunnel --url "$TARGET"
