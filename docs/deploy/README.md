# 部署与备案落地手册

> 🔴🔴 **本文件已废弃（2026-11-11）**：这套方案用 `zangqu-api` / 端口 **3000** / `/opt/zangqu`，
> 与权威口径矛盾（正确是 `dorjea` / 端口 **8300** / `/opt/dorjea` / `/etc/dorjea/env`）。
> **请改看唯一权威版：`docs/部署-dorjea服务端-唯一权威版.md`**，本文件及同目录的
> `deploy.sh` / `zangqu-api.service` / `env.example` 均不得再照抄。

目标域名：**api.dorjea.cn**（子域名，微信小程序不支持父域名）
服务器：**阿里云 ECS**，国内地域
项目路径：`I:\藏趣游戏`

> 本文所有命令都在 ECS 上执行，不是在 Windows 本机。
> 带「待核验」的条目我未在官方页面确认，执行前请自行复核。

---

## 一、ECS 购买要点

| 项 | 建议 | 说明 |
|---|---|---|
| 地域 | **华东1（杭州）** | 江西就近，延迟低；**必须国内地域**，境外无法备案 |
| 规格 | 2 核 4G | `server/` 是 Node 轻量服务，够用 |
| 系统 | **Ubuntu 22.04 LTS** | 本文命令按 Ubuntu 写 |
| 带宽 | 3–5 Mbps 按量 | 起步够，后续按流量升 |
| 磁盘 | 40G 高效云盘 | — |

**买完第一件事：绑定域名前先去备案，不要先解析。**

---

## 二、备案流程（阿里云）

### 2.1 申请备案服务号

1. 登录阿里云控制台 → **备案** → 申请备案服务号
2. 选择刚买的 ECS（每台 ECS 提供 5 个备案服务号）
3. 记录服务号（后面提交备案要用）

### 2.2 提交备案

材料（**已在手的部分**）：

| 材料 | 状态 |
|---|---|
| 营业执照扫描件 | ✅ 已有 |
| 法人身份证正反面 | ✅ 已有 |
| 法人手机号 + 邮箱 | ⚠️ 现场填 |
| 网站负责人（可与法人同一人）| ⚠️ 需人脸核验 |
| 承诺书 | ⛔ **微信后台下载模板 → 盖章 → 扫描** |

**网站名称填**：「规芯智能科技」或「藏趣方块学习工具」
**绝对不能填**：含「游戏」「娱乐」「藏文」「佛教」等字样的名称

**服务内容**：选「其他」或「软件/信息服务」，描述写「藏文识字学习辅助工具」。

### 2.3 等待审批

| 阶段 | 时长 |
|---|---|
| 阿里云初审 | 1–2 工作日 |
| 管局审核 | **7–20 工作日**（法定上限 20 日）|

**期间不要改域名解析、不要关服务器。**

---

## 三、备案通过后：DNS 解析

阿里云 → 云解析 DNS → `dorjea.cn` → 添加记录：

| 记录类型 | 主机记录 | 记录值 | TTL |
|---|---|---|---|
| A | `api` | ECS 公网 IP | 600 |
| A | `www` | ECS 公网 IP | 600 |

**为什么用 `api` 子域**：微信小程序配置服务器域名时，`dorjea.cn` 这种根域会被判定为「父域名」而拒绝。

验证：

```bash
nslookup api.dorjea.cn
# 应返回 ECS 公网 IP
```

---

## 四、SSL 证书

### 方案 A：阿里云免费 DV 证书（推荐，省事）

1. 阿里云 → 数字证书管理服务 → 免费证书 → 申请
2. 域名填 `api.dorjea.cn`
3. 验证方式选 **DNS 验证**（自动加 TXT 记录）
4. 签发后下载 **Nginx 格式**，得到 `.pem` + `.key`

### 方案 B：Let's Encrypt（自动续期）

```bash
sudo apt update && sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.dorjea.cn
```

### 放置证书

```bash
sudo mkdir -p /etc/nginx/ssl
sudo cp api.dorjea.cn.pem /etc/nginx/ssl/
sudo cp api.dorjea.cn.key /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/api.dorjea.cn.key
```

---

## 五、部署 Node 服务

### 5.1 安装 Node

**⚠️ 必须 Node ≥ 22.5** —— `server/store.js` 使用了内置 `node:sqlite` 模块，
Node 20 会直接报 `Cannot find module 'node:sqlite'`。（2026-10-23 本地实跑验证）

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # 必须 >= v22.5，推荐 v22.x LTS
```

**注意**：`node:sqlite` 目前仍是 experimental，启动时会打印
`ExperimentalWarning: SQLite is an experimental feature` —— **这是正常的，不影响运行**。

### 5.2 上传代码

在**本机**（Windows）执行：

```bash
# 排除 node_modules 和 git 历史
scp -r I:/藏趣游戏/server root@<ECS_IP>:/opt/zangqu/
```

或用 git：

```bash
# ECS 上
cd /opt && sudo git clone <你的仓库地址> zangqu
```

### 5.3 安装依赖并启动

```bash
cd /opt/zangqu/server
# ⚠️ 本项目服务端**零外部依赖**：全部使用 Node 内置模块
#    （assert / crypto / fs / http / https / node:sqlite）
#    所以**不需要 npm install**，也没有 package.json。
#    2026-10-23 本地实跑确认：直接 `node index.js` 即可启动。

# 用 systemd 常驻
sudo tee /etc/systemd/system/zangqu-api.service > /dev/null <<'EOF'
[Unit]
Description=Zangqu API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/zangqu/server
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now zangqu-api
sudo systemctl status zangqu-api
```

### 5.4 确认监听

```bash
curl http://127.0.0.1:3000/health
# 期望：ok
```

---

## 六、Nginx 配置

```bash
sudo apt install -y nginx
sudo cp docs/deploy/nginx-api.dorjea.cn.conf /etc/nginx/conf.d/
sudo nginx -t          # 语法检查，必须通过
sudo systemctl reload nginx
```

验证：

```bash
curl -I https://api.dorjea.cn/health
# 期望：HTTP/2 200

# 检查 TLS 版本（必须是 1.2 或 1.3）
openssl s_client -connect api.dorjea.cn:443 -tls1_1   # 应失败
openssl s_client -connect api.dorjea.cn:443 -tls1_2   # 应成功
```

---

## 七、微信后台配置

### 7.1 服务器域名

微信公众平台 → 开发 → 开发管理 → 开发设置 → **服务器域名**

| 类型 | 填什么 |
|---|---|
| **request 合法域名** | `https://api.dorjea.cn` |
| socket 合法域名 | `wss://api.dorjea.cn`（若用 WebSocket）|
| uploadFile 合法域名 | `https://api.dorjea.cn` |
| downloadFile 合法域名 | `https://api.dorjea.cn` |

**注意**：
- 必须是 **HTTPS**
- **不能带端口**
- **不能填 IP**
- **不能填父域名**（`dorjea.cn` ✗）
- 每月只能修改 **5 次**，想清楚再改

### 7.2 客户端配置同步

项目里要改的地方（**待确认具体位置**）：

```bash
# 本机执行，找出所有 localhost / 127.0.0.1
grep -rn "localhost\|127.0.0.1" config/ utils/ pages/ 2>/dev/null
```

改完后必须重新构建 H5：

```bash
node scripts/build-h5.js
node scripts/validate.js
```

---

## 八、验收清单

| # | 检查项 | 命令 / 方法 | 期望 |
|---|---|---|---|
| 1 | DNS 解析 | `nslookup api.dorjea.cn` | 返回 ECS IP |
| 2 | HTTP 跳 HTTPS | `curl -I http://api.dorjea.cn` | 301 → https |
| 3 | HTTPS 可用 | `curl -I https://api.dorjea.cn/health` | 200 |
| 4 | TLS 版本 | `openssl s_client -tls1_1` | **失败**（拒绝 1.1）|
| 5 | 证书有效期 | `curl -vI https://api.dorjea.cn 2>&1 \| grep expire` | 未过期 |
| 6 | Node 常驻 | `systemctl status zangqu-api` | active (running)|
| 7 | 重启自恢复 | `sudo reboot` 后访问 | 仍可用 |
| 8 | 微信后台校验 | 开发者工具「检查服务器域名」| 通过 |
| 9 | 备案号展示 | 小程序关于页 | 有备案号 |

---

## 九、待核验项（我不确定，执行前必须自己查）

- [ ] 阿里云免费 DV 证书的**有效期**（可能是 3 个月，需自动续期）
- [ ] 江西管局对**新注册企业**（2026-04）是否要求补充材料
- [ ] 小程序备案是否要求**网站已完成 ICP 备案**（大概率要求）
- [ ] 微信「服务器域名」校验是否要求**已备案**（待实测）
- [ ] 是否需要**公安联网备案**（ICP 通过后 30 日内，法定要求）

---

## 十、当前状态

```
域名 dorjea.cn        已注册，无 DNS 记录
api.dorjea.cn         NXDOMAIN
ECS                   待购买/待确认
备案                  未开始
SSL                   未申请
Nginx 配置            已就绪（本文件同目录）
```

**本文件不代表任何备案已完成。**
