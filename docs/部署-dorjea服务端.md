# dorjea.cn 服务端部署文档

> 交给运维/服务商执行。**所有命令可直接复制。**
> 编写时间：2026-10-30
> 目标：在共享服务器（阿里云 ECS 47.93.122.222）上，与 `guixinkeji.cn` **完全隔离**地部署 dorjea.cn 的后端服务。

---

## 0. 先明确一件事（很重要）

**dorjea.cn 不是网站，是小程序的后端 API。**

- 访问 `https://dorjea.cn/` **看不到任何网页**，只会 404
- 能验证的只有 `GET /health` 返回 200
- **不要**给它配静态首页、不要配 404 跳转页

审核员或用户打开是空白，**这是正常的，不是部署失败**。

---

## 1. 环境要求

| 项 | 要求 | 检查命令 |
|---|---|---|
| **Node.js** | **≥ 22.5**（代码用了 `node:sqlite`） | `node -v` |
| 端口 | **8300**（guixinkeji 用 8200，不冲突） | `ss -lntp \| grep 8300` |
| 磁盘 | ≥ 500MB（数据库 + 日志） | `df -h` |

### 如果 Node 版本不够

```bash
# 用 nvm 装（推荐，不影响全局）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node -v   # 应显示 v22.x
```

**⚠️ 必须 ≥ 22.5。** 低于此版本 `node:sqlite` 不存在，服务启动会直接报错。

---

## 2. 拉代码

```bash
# 建议放独立目录，和 guixinkeji 完全分开
sudo mkdir -p /opt/dorjea
sudo chown $USER:$USER /opt/dorjea
cd /opt/dorjea

git clone https://github.com/zhugang-kevin/Tibetan-Character-Blocks.git .
```

**只需要 `server/` 目录。** 小程序前端代码在这个仓库里但不需要部署。

```bash
cd /opt/dorjea/server
ls    # 应看到 index.js  orders.js  store.js  sign.js  ...
```

---

## 3. 数据目录与密钥

### 3.1 创建数据目录（独立，不与其他站共用）

```bash
sudo mkdir -p /var/lib/dorjea
sudo chown $USER:$USER /var/lib/dorjea
chmod 750 /var/lib/dorjea
```

### 3.2 创建环境变量文件（**密钥走这里，不写 systemd**）

```bash
sudo mkdir -p /etc/dorjea
sudo tee /etc/dorjea/env > /dev/null <<'EOF'
PORT=8300
DB_PATH=/var/lib/dorjea/pay.db
ORDERS_DB=/var/lib/dorjea/orders.db
TELEMETRY_TOKEN=请换成随机32位字符串
WX_APPID=请填小程序AppID
WX_APPKEY_PROD=请填微信支付生产密钥
WX_APPKEY_SANDBOX=请填微信支付沙箱密钥
MAX_BODY_BYTES=1048576
TELEMETRY_MAX_BYTES=10485760
TELEMETRY_MAX_PER_MIN=120
EOF

# 🔴 关键：权限必须 640，否则 systemctl cat 能看到明文
sudo chown root:root /etc/dorjea/env
sudo chmod 640 /etc/dorjea/env
```

**生成随机 token**：

```bash
openssl rand -hex 32
```

把结果填到 `TELEMETRY_TOKEN`。

### 3.3 环境变量说明

| 变量 | 作用 | 不填会怎样 |
|---|---|---|
| `PORT` | 监听端口 | 默认 8787 |
| `DB_PATH` | 支付数据库路径 | 用默认路径（可能和别的站冲突）|
| `ORDERS_DB` | 订单库路径 | 同上 |
| `TELEMETRY_TOKEN` | 遥测上报鉴权 | 遥测接口拒绝写入 |
| `WX_APPID` | 小程序 AppID | 支付签名失败 |
| `WX_APPKEY_PROD` | 支付生产密钥 | 支付签名失败 |
| `MAX_BODY_BYTES` | 请求体上限 | 用默认值 |

---

## 4. systemd 服务

### 4.1 创建 unit

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

# 日志走 journald，和 guixinkeji 分开查
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dorjea

# 安全加固
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/dorjea

[Install]
WantedBy=multi-user.target
EOF
```

**⚠️ 注意两点**：
1. `User=www-data` —— 如果 server 目录属主不是 www-data，要么改这里，要么 `chown -R www-data:www-data /opt/dorjea`
2. `ExecStart=/usr/bin/node` —— 如果用 nvm 装的 Node，**必须写绝对路径**（`which node` 查）。nvm 的 Node 在 `~/.nvm/versions/node/v22.x/bin/node`，**www-data 用户访问不到**，这种情况下建议用系统级安装的 Node 或 `nvm alias default 22` 后用绝对路径 + `chmod o+x` 家目录。

### 4.2 启动

```bash
sudo systemctl daemon-reload
sudo systemctl enable dorjea
sudo systemctl start dorjea
sudo systemctl status dorjea
```

**看日志**：

```bash
sudo journalctl -u dorjea -n 50 --no-pager
```

---

## 5. Nginx 反向代理

### 5.1 新建独立 server block

```bash
sudo tee /etc/nginx/sites-available/dorjea.conf > /dev/null <<'EOF'
# dorjea.cn —— 小程序后端 API
# 与 guixinkeji.cn 完全独立：独立日志、独立 upstream

upstream dorjea_api {
    server 127.0.0.1:8300;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name dorjea.cn www.dorjea.cn;

    # 独立日志，方便单独排查
    access_log /var/log/nginx/dorjea.access.log;
    error_log  /var/log/nginx/dorjea.error.log;

    # Let's Encrypt HTTP-01 验证用
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name dorjea.cn www.dorjea.cn;

    ssl_certificate     /etc/letsencrypt/live/dorjea.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dorjea.cn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    access_log /var/log/nginx/dorjea.access.log;
    error_log  /var/log/nginx/dorjea.error.log;

    # API 不需要大 body
    client_max_body_size 2m;

    location / {
        proxy_pass http://dorjea_api;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
        proxy_read_timeout 30s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/dorjea.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5.2 备案未下来时的临时方案

**备案通过前 80/443 会被阿里云拦截。** 这段时间先用：

```
http://47.93.122.222:8300/health
```

**或者**临时开一个非标端口做外部测试（用完记得关）：

```bash
# 在 dorjea.conf 里加一个临时 server 块
server {
    listen 8301;
    server_name _;
    location / { proxy_pass http://dorjea_api; }
}
```

---

## 6. SSL 证书（备案期间也能签）

### 6.1 用 DNS-01 验证（**不走 80 端口，备案期间可用**）

```bash
sudo apt install certbot
# 或 yum install certbot

sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d dorjea.cn -d www.dorjea.cn
```

**certbot 会让你在 DNSPod 添加一条 TXT 记录**：

```
_acme-challenge.dorjea.cn  TXT  <certbot 给的值>
```

**在腾讯云 DNSPod 后台加**（域名在腾讯云，DNS 也是 DNSPod）：
1. 登录腾讯云 → DNSPod → dorjea.cn → 记录管理
2. 添加记录：主机记录 `_acme-challenge`，类型 `TXT`，值粘贴 certbot 给的
3. 等 1–2 分钟，回终端按回车

**证书会存到** `/etc/letsencrypt/live/dorjea.cn/`

### 6.2 自动续期

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

**但 `--manual` 方式不能自动续期**（每次要手动加 TXT）。

**建议备案通过后改用 HTTP-01**（可全自动）：

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d dorjea.cn -d www.dorjea.cn
```

---

## 7. 验收清单

**每一条都必须过，缺一条就是没部署好。**

| # | 检查 | 命令 | 期望 |
|---|---|---|---|
| 1 | 服务运行中 | `systemctl is-active dorjea` | `active` |
| 2 | 端口监听 | `ss -lntp \| grep 8300` | 有 LISTEN |
| 3 | 本机健康检查 | `curl -s localhost:8300/health` | JSON，含 `ok` |
| 4 | 外部 IP 直连 | `curl -s http://47.93.122.222:8300/health` | 同上 |
| 5 | Nginx 配置 | `nginx -t` | `syntax is ok` |
| 6 | 域名访问（备案后）| `curl -s https://dorjea.cn/health` | 同上 |
| 7 | **和 guixinkeji 互不影响** | `systemctl status guixinkeji workbench` | 都还是 active |
| 8 | 数据库文件权限 | `ls -l /var/lib/dorjea/` | 属主 www-data |
| 9 | 密钥不可见 | `systemctl cat dorjea \| grep -i appkey` | **应该没有输出** |

**第 9 条最重要** —— 如果能看到密钥，说明没走 EnvironmentFile，**必须修**。

---

## 8. 常见问题

### Q1: 服务起不来，日志报 `Cannot find module 'node:sqlite'`
**Node 版本低于 22.5。** 升级 Node。

### Q2: `systemctl status` 显示 `status=203/EXEC`
`ExecStart` 里的 node 路径不对。用 `which node` 查实际路径填进去。

### Q3: 外部访问 8300 超时
阿里云**安全组**没放行 8300。控制台 → 安全组 → 入方向 → 加 8300。

### Q4: Nginx 起不来，报 `duplicate default server`
`dorjea.conf` 里有 `default_server` 但 guixinkeji 已经占了。**去掉 `default_server`**（本文档的配置里本来就没有）。

### Q5: 域名访问 403 / 直接断
**备案没通过，或缺阿里云接入。** 这是预期行为，等备案。

### Q6: 数据库报 `database is locked`
两个进程写了同一个文件。确认 `DB_PATH` / `ORDERS_DB` 都指向 `/var/lib/dorjea/` 独立目录。

---

## 9. 回滚

出问题时，三秒内恢复原状（不影响 guixinkeji）：

```bash
sudo systemctl stop dorjea
sudo systemctl disable dorjea
sudo rm /etc/nginx/sites-enabled/dorjea.conf
sudo nginx -t && sudo systemctl reload nginx
```

**guixinkeji.cn 完全不受影响** —— 这是隔离设计的价值。

---

## 10. 需要对方确认的事项

| # | 事项 | 说明 |
|---|---|---|
| 1 | Node 版本 | **必须 ≥ 22.5**，请回报实际版本 |
| 2 | `www-data` 是否能读 `/opt/dorjea/server` | 不能的话要 chown |
| 3 | 安全组是否放行 8300 | 只对内网可先不放 |
| 4 | 密钥是否走 EnvironmentFile | **必须**，且 640 权限 |
| 5 | 验收清单 9 条是否全过 | 逐条回报 |
