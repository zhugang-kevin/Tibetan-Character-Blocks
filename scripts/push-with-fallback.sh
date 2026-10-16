#!/bin/sh
# scripts/push-with-fallback.sh — 一条命令把「推送」这件事做对
#
# ## 为什么要有这个脚本（本项目踩过三次的同一个坑）
#   · 直连 GitHub 常被本机代理掐掉 TLS：git 报
#       TLS connect error: error:0A000126:SSL routines::unexpected eof while reading
#     历史解法是 `-c http.version=HTTP/1.1`（此前靠记忆，写在 README 与 memory 里）。
#   · 若 HTTPS 彻底不通，SSH 通道往往仍然通（可用 `ssh -T git@github.com` 验证）。
#   · 以前每次都要临时查、临时试；本脚本把「先跑全量门禁 → 探测通道 → 挑通的走」
#     固化成一条命令。
#
# ## 设计原则
#   ① **绝不使用 --no-verify**：门禁红了就不许推（项目铁律，红门不许粉饰）。
#   ② **先探测后推送**：通道探测用 ls-remote（秒级、不触发钩子），
#      挑出真正通的那条路再 push —— 避免每条路都白跑一次 2~3 分钟的全量门禁。
#   ③ **fail closed**：git / python 找不到就报错退出，不静默放行。
#
# 用法：
#   sh scripts/push-with-fallback.sh            # 推当前 HEAD 到 main
#   sh scripts/push-with-fallback.sh <分支名>   # 推到指定分支

set -u

BRANCH="${1:-main}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

echo "── 推送（自动挑通道）· 目标分支：$BRANCH ──"

# ---------- 0. 先跑全量门禁，红了就不推 ----------
PY=""
if command -v python >/dev/null 2>&1; then
  PY=python
elif [ -x "C:/Users/zhuga/.workbuddy/binaries/python/versions/3.13.12/python.exe" ]; then
  PY="C:/Users/zhuga/.workbuddy/binaries/python/versions/3.13.12/python.exe"
fi
if [ -n "$PY" ]; then
  echo "[0/3] 全量门禁（红了就不推）…"
  if ! "$PY" scripts/ci.py; then
    echo ""
    echo "✗ 全量门禁有红项 —— 不推送。先修红，再跑本脚本。"
    exit 1
  fi
else
  echo "⚠ 没找到 python，跳过全量门禁；pre-push 钩子仍会拦（fail closed）。"
fi

# ---------- 1. 收集通道 ----------
HTTPS_URL="$(git config --get remote.origin.url || true)"
if [ -z "$HTTPS_URL" ]; then
  echo "✗ 读不到 remote.origin.url"
  exit 1
fi

# https://github.com/OWNER/REPO.git → git@github.com:OWNER/REPO.git
SSH_URL=""
case "$HTTPS_URL" in
  https://github.com/*)
    SSH_URL="$(echo "$HTTPS_URL" | sed 's#^https://github.com/#git@github.com:#')"
    ;;
  git@github.com:*)
    SSH_URL="$HTTPS_URL"
    HTTPS_URL="https://github.com/$(echo "$HTTPS_URL" | sed 's#^git@github.com:##')"
    ;;
esac

# ---------- 2. 探测：哪条路通（ls-remote 不触发钩子，秒级） ----------
PROBE_TIMEOUT=25
probe() {
  # $1 = 标签, $2 = 远端地址；前缀的 git -c 只能整体传，故用函数包裹
  url="$2"
  if command -v timeout >/dev/null 2>&1; then
    GIT_TERMINAL_PROMPT=0 timeout "$PROBE_TIMEOUT" \
      git -c http.version=HTTP/1.1 ls-remote --exit-code "$url" HEAD >/dev/null 2>&1
  else
    GIT_TERMINAL_PROMPT=0 \
      git -c http.version=HTTP/1.1 ls-remote --exit-code "$url" HEAD >/dev/null 2>&1
  fi
}

CHOSEN=""
echo "[1/3] 探测 HTTPS…"
if probe https "$HTTPS_URL"; then
  CHOSEN="$HTTPS_URL"; echo "      ✓ HTTPS 通"
else
  echo "      ✗ HTTPS 不通（多为本机代理掐断 TLS 握手）"
  if [ -n "$SSH_URL" ]; then
    echo "[2/3] 探测 SSH…"
    if probe ssh "$SSH_URL"; then
      CHOSEN="$SSH_URL"; echo "      ✓ SSH 通"
    else
      echo "      ✗ SSH 也不通"
    fi
  fi
fi

# ---------- 3. 推送（带重试，仍不使用 --no-verify）----------
if [ -z "$CHOSEN" ]; then
  echo ""
  echo "✗ 两条通道都不通，本次未推送（提交已在本地，不会丢）。"
  echo "  自查："
  echo "    · HTTPS：git -c http.version=HTTP/1.1 ls-remote origin HEAD"
  echo "    · SSH  ：ssh -T git@github.com   （应返回 Hi <你的账号>! ...）"
  echo "    · 代理 ：v2rayN 是否在跑、当前节点是否可用（10808/10809）"
  exit 1
fi

echo "[3/3] 推送 → $CHOSEN"
i=1
while [ "$i" -le 3 ]; do
  echo "      第 $i 次…"
  if git -c http.version=HTTP/1.1 push "$CHOSEN" "HEAD:$BRANCH"; then
    echo "✓ 推送成功"
    exit 0
  fi
  i=$((i + 1))
  [ "$i" -le 3 ] && sleep 5
done

echo ""
echo "✗ 三次都没推上去。提交已在本地，重试本脚本即可。"
exit 1
