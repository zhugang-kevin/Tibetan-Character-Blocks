#!/usr/bin/env bash
#
# 藏趣方块 · 一键部署脚本
# 用法（在 ECS 上，root 身份）：
#   bash deploy.sh /path/to/zangqu.tar.gz
#
# 前置：代码包已上传到 ECS（scp 或 git clone）
# 强调：本脚本**只新增独立配置**，不覆盖、不重启现有服务。
set -euo pipefail

APP_DIR=/opt/zangqu
SERVER_DIR="$APP_DIR/server"
LOG_DIR=/var/log/zangqu
NGINX_CONF=/etc/nginx/conf.d/api.dorjea.cn.conf
SERVICE=/etc/systemd/system/zangqu-api.service

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ─── 0. 前置检查 ────────────────────────────────
say "检查环境"
[ "$(id -u)" -eq 0 ] || die "需要 root 权限"
command -v node >/dev/null || die "未安装 node"

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
ok "node $(node -v)"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  die "需要 Node >= 22.5（server 用了内置 node:sqlite），当前 $(node -v)"
fi
ok "Node 版本满足 node:sqlite 要求"

# ─── 1. 解压代码 ────────────────────────────────
if [ -n "${1:-}" ] && [ -f "${1:-}" ]; then
  say "解压代码包"
  mkdir -p "$APP_DIR"
  tar -xzf "$1" -C "$APP_DIR" --strip-components=1
  ok "已解压到 $APP_DIR"
else
  say "未提供代码包，假定代码已在 $APP_DIR"
  [ -d "$SERVER_DIR" ] || die "$SERVER_DIR 不存在，请先上传代码"
fi

# ─── 2. 目录与权限 ──────────────────────────────
say "准备目录权限"
mkdir -p "$LOG_DIR"
touch "$LOG_DIR/api.log"
chown -R www-data:www-data "$SERVER_DIR" "$LOG_DIR"
chmod 750 "$LOG_DIR"
ok "$LOG_DIR 就绪"

# ─── 3. 数据库迁移 ──────────────────────────────
say "检查 SQLite 数据库"
if [ -f "$SERVER_DIR/orders.db" ]; then
  ok "orders.db 已存在（保留，不覆盖）"
else
  ok "orders.db 不存在，首次启动时自动创建"
fi

# ─── 4. systemd 服务 ────────────────────────────
say "安装 systemd 服务"
if [ -f "$APP_DIR/docs/deploy/zangqu-api.service" ]; then
  cp "$APP_DIR/docs/deploy/zangqu-api.service" "$SERVICE"
else
  die "找不到 docs/deploy/zangqu-api.service"
fi
systemctl daemon-reload
systemctl enable zangqu-api >/dev/null 2>&1
ok "服务已启用（开机自启）"

# ─── 5. 启动并验证 ──────────────────────────────
say "启动 API 服务"
systemctl restart zangqu-api
sleep 2
if systemctl is-active --quiet zangqu-api; then
  ok "服务运行中"
else
  journalctl -u zangqu-api -n 20 --no-pager || true
  die "服务启动失败，见上方日志"
fi

say "本地健康检查"
HEALTH=$(curl -s --max-time 5 http://127.0.0.1:3000/health || true)
echo "  $HEALTH"
echo "$HEALTH" | grep -q '"ok":true' || die "健康检查失败，期望 {\"ok\":true,...}"
ok "API 健康"

# ─── 6. Nginx（只加独立 conf，绝不覆盖）──────────
say "检查 Nginx"
if ! command -v nginx >/dev/null; then
  die "未安装 nginx"
fi

if [ -f "$NGINX_CONF" ]; then
  ok "已存在 $NGINX_CONF（跳过，不覆盖）"
else
  if [ -f "$APP_DIR/docs/deploy/nginx-api.dorjea.cn.conf" ]; then
    cp "$APP_DIR/docs/deploy/nginx-api.dorjea.cn.conf" "$NGINX_CONF"
    ok "已新增 $NGINX_CONF"
  else
    die "找不到 nginx 配置文件"
  fi
fi

say "校验 Nginx 配置（失败则回滚）"
if nginx -t 2>/tmp/nginx-test.log; then
  ok "配置语法通过"
else
  cat /tmp/nginx-test.log
  rm -f "$NGINX_CONF"
  die "Nginx 配置有误，已删除新增文件，现有服务未受影响"
fi

say "热加载 Nginx（reload 不中断现有连接）"
nginx -s reload
ok "已 reload"

# ─── 7. 最终检查 ────────────────────────────────
say "部署结果"
echo "  服务状态：$(systemctl is-active zangqu-api)"
echo "  本地 API ：$(curl -s --max-time 5 http://127.0.0.1:3000/health || echo 失败)"
echo ""
echo "  ⚠️ 域名解析与 HTTPS 需单独完成（见 docs/deploy/README.md）："
echo "     · api.dorjea.cn  ->  47.93.122.222"
echo "     · SSL 证书放到 /etc/nginx/ssl/api.dorjea.cn.{pem,key}"
echo "     · 备案通过前不要对外宣称服务可用"
echo ""
ok "部署脚本执行完毕"
