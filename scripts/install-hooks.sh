#!/bin/sh
# scripts/install-hooks.sh — 装上本仓的 Git 钩子（新克隆跑一次即可）
#
# 为什么需要这一步：
#   Git 默认不会用 .githooks/ 里的钩子 —— 必须把 core.hooksPath 指过去。
#   不装 = 门禁只在「有人记得手动跑」时才生效，等于没有拦截
#   （本仓在 2026-10-16 之前正是这个状态：只有 .sample 钩子）。
#
# 装上后：
#   每次 git commit → 跑 scripts/test-level-guard.js / test-all-150.js /
#                     test-content-consistency.js / validate.js（约 6 秒）
#   每次 git push   → 跑全量 scripts/ci.py（含体验版端到端）
#
# 卸载：git config --unset core.hooksPath

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -d .githooks ]; then
  echo "✗ 找不到 .githooks 目录（请在仓库根运行）"
  exit 1
fi

chmod +x .githooks/pre-commit .githooks/pre-push 2>/dev/null || true
git config core.hooksPath .githooks

echo "✓ 已启用本仓钩子：core.hooksPath = .githooks"
echo "  pre-commit : 关卡护栏 / 150 关打通 / 跨内容一致性 / 结构门禁（约 6 秒）"
echo "  pre-push   : 全量 scripts/ci.py（含体验版端到端）"
echo ""
echo "  提示：这些钩子**故意**会拦下「改了关卡但没更新指纹」的提交 ——"
echo "        那是有意设计（改关卡必须显式跑 test-level-guard.js --update 留痕）。"
