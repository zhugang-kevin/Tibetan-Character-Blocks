# dorjea 后端启动 + 验收（唯一权威版，2026-11-11）

> 卡点已定位：**dorjea 支付后端进程还没在 8300 端口跑起来**，导致公网访问 502。
> 本文件是**唯一正确**的部署口径，废弃旧的 `docs/deploy/`（zangqu/3000 端口）方案。
>
> **唯一正确口径（不许再改）**：
> - 端口 = **8300**（不是 3000、不是 5100）
> - 服务名 = **dorjea**
> - 代码目录 = **/opt/dorjea**（只需 `server/`）
> - 环境变量 = **/etc/dorjea/env**（root:root 640）
> - Nginx 反代 = `proxy_pass http://127.0.0.1:8300`

---

## 第 0 步：确认环境

```bash
node -v          # 必须 >= v22.5（server 用了 node:sqlite）
ss -lntp | grep 8300    # 现在应该没有输出（后端还没起）
```

---

## 第 1 步：拉代码（只需 server/）

```bash
sudo mkdir -p /opt/dorjea
sudo chown $USER:$USER /opt/dorjea
cd /opt/dorjea
git clone https://github.com/zhugang-kevin/Tibetan-Character-Blocks.git .
cd /opt/dorjea/server
ls     # 应看到 index.js orders.js store.js sign.js store-challenge.js
```

> 若已克隆过，执行 `cd /opt/dorjea && git pull` 更新到最新。

---

## 第 2 步：数据目录 + 环境变量（密钥走 env，权限 640）

```bash
# 数据目录（SQLite 库独立存放）
sudo mkdir -p /var/lib/dorjea
sudo chown $USER:$USER /var/lib/dorjea
chmod 750 /var/lib/dorjea

# 生成遥测 token
TOKEN=$(openssl rand -hex 32)

# 环境变量文件（密钥在这里，绝不写进 systemd）
sudo mkdir -p /etc/dorjea
sudo tee /etc/dorjea/env > /dev/null <<EOF
PORT=8300
DB_PATH=/var/lib/dorjea/pay.db
ORDERS_DB=/var/lib/dorjea/orders.db
TELEMETRY_TOKEN=${TOKEN}
WX_APPID=wx3378038122ee9d54
WX_APPSECRET=请填你的AppSecret
WX_OFFER_ID=请填你的OfferID
WX_APPKEY_PROD=请填你的生产AppKey
WX_APPKEY_SANDBOX=请填你的沙箱AppKey
MAX_BODY_BYTES=1048576
TELEMETRY_MAX_BYTES=10485760
TELEMETRY_MAX_PER_MIN=120
EOF

# 🔴 关键：权限 640，否则 systemctl cat 能看到明文
sudo chown root:root /etc/dorjea/env
sudo chmod 640 /etc/dorjea/env
```

> 现在还没 OfferID/AppKey 也没关系，先填空字符串也能启动（`/health` 会返回 `configured:false`）。
> 拿到真值后再补进去并 `systemctl restart dorjea`。

---

## 第 3 步：systemd 服务（端口 8300）

```bash
sudo tee /etc/systemd/system/dorjea.service > /dev/null <<'EOF'
[Unit]
Description=dorjea.cn Backend API (Tibetan Character Blocks)
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/dorjea/server
EnvironmentFile=/etc/dorjea/env
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

StandardOutput=journal
StandardError=journal
SyslogIdentifier=dorjea

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/dorjea

[Install]
WantedBy=multi-user.target
EOF

# 代码目录属主给 www-data
sudo chown -R www-data:www-data /opt/dorjea/server

sudo systemctl daemon-reload
sudo systemctl enable dorjea
sudo systemctl start dorjea
sudo systemctl status dorjea
```

> ⚠️ 若 `ExecStart=/usr/bin/node` 不存在（用 nvm 装的 Node），用 `which node` 查绝对路径替换。

---

## 第 4 步：验收（全部通过 = 后端就绪）

```bash
# 1. 服务运行中
systemctl is-active dorjea          # 期望：active

# 2. 端口监听
ss -lntp | grep 8300               # 期望：有 LISTEN

# 3. 本地健康检查（最关键）
curl -s http://127.0.0.1:8300/health
# 期望：{"status":"up","configured":false}
# （configured:false 是因为 OfferID/AppKey 还没填，正常；填了之后变 true）
```

---

## 第 5 步：确认 Nginx 反代端口是 8300（不是 5100）

在 `/etc/nginx/conf.d/api.dorjea.cn.conf`（或你的 Nginx 配置里）确认这一行：

```nginx
proxy_pass http://127.0.0.1:8300;   # 必须是 8300，不是 5100
```

然后：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 第 6 步：公网终极验收

```bash
curl -s https://api.dorjea.cn/health
# 期望：{"status":"up","configured":false}   ← 不再 404、不再 502
```

如果这一步返回 `{"status":"up",...}`，说明：**证书 + Nginx + 后端 8300 全链路彻底打通。**

---

## 常见失败对照

| 症状 | 原因 | 解决 |
|---|---|---|
| `Cannot find module 'node:sqlite'` | Node < 22.5 | 升级 Node |
| `systemctl status` 显示 203/EXEC | `ExecStart` 的 node 路径不对 | `which node` 填绝对路径 |
| `curl 127.0.0.1:8300` 连不上 | 服务没起 / 端口不对 | `journalctl -u dorjea -n 50` 看日志 |
| 公网 502 | Nginx 反代端口不是 8300 | 改 `proxy_pass` 为 8300 + reload |
| 公网 404 | 反代到了 5100（wx-eco）| 同上，改成 8300 |
