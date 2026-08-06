#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.local ]]; then
  echo "未找到 .env.local，正在从 .env.example 复制…"
  cp .env.example .env.local
  echo "请先编辑 .env.local，填入 DEEPSEEK_API_KEY 后再运行。"
  exit 1
fi

if ! grep -qE '^DEEPSEEK_API_KEY=.+' .env.local && ! grep -qE '^LLM_API_KEY=.+' .env.local; then
  echo "警告：.env.local 里好像还没有 DEEPSEEK_API_KEY（将走演示模式）。"
fi

mkdir -p data/uploads data/outputs data/references data/skills

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run build
echo "启动生产服务：http://127.0.0.1:3000"
exec npm run start:prod
