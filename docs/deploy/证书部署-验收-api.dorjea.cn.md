# api.dorjea.cn 证书部署 + 验收（2026-11-11）

> 前置已确认：`dorjea.cn` 备案通过（赣ICP备2026028137号-2）；证书已签发（TrustAsia DV，CN=api.dorjea.cn，有效期 2026-11-11 ~ 2027-02-09）。
> 本文件只做一件事：**把证书放到服务器 → 配 Nginx → 让 `https://api.dorjea.cn` 通**。

---

## 一、证书文件（你手上已有，已核验有效）

Nginx 包 `api.dorjea.cn_nginx.zip` 解压后，**只需要这两个文件**：

| 文件 | 用途 | 已核验 |
|---|---|---|
| `api.dorjea.cn_bundle.crt` | 证书 + 中间证书链（3 张） | ✅ CN=api.dorjea.cn，有效期 90 天 |
| `api.dorjea.cn.key` | 私钥 | ✅ RSA，与证书模数一致 |

（`api.dorjea.cn.csr` 是签发请求，服务器上不需要。）

---

## 二、在服务器上执行（照抄，逐条）

### 2.1 上传证书到服务器（在你本地电脑执行，scp 或手动）

```bash
# 方式 A：scp（本地执行，替换 user@ 为你的服务器登录）
scp "G:/上饶规芯科技/网站信息/腾讯云相关证书/api.dorjea.cn_nginx/api.dorjea.cn_bundle.crt" user@47.93.122.222:/tmp/
scp "G:/上饶规芯科技/网站信息/腾讯云相关证书/api.dorjea.cn_nginx/api.dorjea.cn.key" user@47.93.122.222:/tmp/
```

> 若用宝塔/云控制台上传，把这两个文件传上去即可，路径记住，后面 Nginx 里填对。

### 2.2 服务器上放置证书（root 执行）

```bash
sudo mkdir -p /etc/nginx/ssl
sudo cp /tmp/api.dorjea.cn_bundle.crt /etc/nginx/ssl/api.dorjea.cn_bundle.crt
sudo cp /tmp/api.dorjea.cn.key          /etc/nginx/ssl/api.dorjea.cn.key
sudo chmod 600 /etc/nginx/ssl/api.dorjea.cn.key
sudo chown root:root /etc/nginx/ssl/*
ls -l /etc/nginx/ssl/
```

### 2.3 放 Nginx 配置

把本项目 `docs/deploy/nginx-api.dorjea.cn.conf` 的内容复制到服务器：

```bash
sudo tee /etc/nginx/conf.d/api.dorjea.cn.conf > /dev/null <<'EOF'
# 内容见 docs/deploy/nginx-api.dorjea.cn.conf（已按 8300 端口 + 实际证书名写好）
EOF
```

> 更简单：直接在服务器上 `cat > /etc/nginx/conf.d/api.dorjea.cn.conf` 后粘贴本仓库
> `docs/deploy/nginx-api.dorjea.cn.conf` 的全文。

### 2.4 校验 + 加载

```bash
sudo nginx -t            # 期望：syntax is ok / test is successful
sudo systemctl reload nginx
```

---

## 三、验收（全部通过 = 部署完成）

```bash
# 1. 后端是否已起（若还没起，先按 docs/部署-dorjea服务端.md 起服务，端口 8300）
curl -s http://127.0.0.1:8300/health

# 2. HTTPS 是否通（最关键）
curl -s https://api.dorjea.cn/health
# 期望：{"status":"up",...} 或至少不是 502/证书错误

# 3. 证书域名与有效期
echo | openssl s_client -connect api.dorjea.cn:443 -servername api.dorjea.cn 2>/dev/null \
  | openssl x509 -noout -subject -dates

# 4. TLS 版本（微信要求 ≥ 1.2）
echo | openssl s_client -connect api.dorjea.cn:443 -tls1_2 2>/dev/null | grep -i "Protocol\|Cipher"
```

**期望**：
- 第 2 步返回 JSON（`status:up`）→ 证书 + Nginx + 后端全部打通。
- 第 3 步 `subject=CN=api.dorjea.cn`，日期在有效期内。
- 第 4 步 `Protocol: TLSv1.2` 或 `TLSv1.3`。

---

## 四、通过后，回到小程序配置

1. 把 `config/pay.js` 的 `orderApi` 填成 `https://api.dorjea.cn/pay/order`（与 offerId、goodsPublished 一起填，避免半配置判红）。
2. mp 后台 → 开发 → 开发设置 → 服务器域名 → request 合法域名，加 `https://api.dorjea.cn`。

---

## 五、常见失败对照

| 症状 | 原因 | 解决 |
|---|---|---|
| `curl https` 证书报错 | 证书文件路径/文件名和 Nginx 里不一致 | 核对 `/etc/nginx/ssl/` 文件名 == conf 里写的 |
| `502 Bad Gateway` | 后端没起，或端口不是 8300 | `systemctl status dorjea`，确认监听 8300 |
| `curl https` 超时 | 阿里云安全组没放行 443 | 控制台安全组加 443 入方向 |
| `subject` 不是 api.dorjea.cn | 证书用错域名 | 确认用的是 api.dorjea.cn 的包，不是别的 |
