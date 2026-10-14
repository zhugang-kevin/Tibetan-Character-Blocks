# 虚拟支付服务端（D91）

> **它为什么存在**：官方红线 ——「**签名只能在服务端计算**（AppKey 和 session_key
> 绝不能出现在小程序前端代码里）」。加之外发回调需要 HTTPS 公网地址，
> 所以虚拟支付**必须有服务端**。这是本项目（原 D3「纯本地」）唯一必须联网的部分。

## 文件

| 文件 | 作用 |
|---|---|
| `sign.js` | 双签名 + 回调验签。**算法出处：腾讯云官方《Signature and Verification》** |
| `index.js` | 五个接口：下单 / 发货回调 / 主动查单 / 进度同步 / **收礼箱**。**零依赖**（只用 Node 内置模块） |
| `test-sign.js` | 签名回归测试。**不依赖任何凭证**，跑一次就知道算法有没有被改坏 |

## 跑测试（**任何凭证都没有也能跑**）

```bash
node server/test-sign.js     # 期望：通过 8 / 失败 0
```

期望值来自**独立实现**（Python hmac/hashlib）按官方公式复算，两次结果逐字符一致。

## 五个接口

| 接口 | 用途 |
|---|---|
| `POST /pay/order` | 前端下单 → 返回 `{ signData, paySig, signature, mode }` |
| `POST /pay/notify` | 微信发货回调 → **验签 → 幂等发货** |
| `POST /pay/query` | 主动查单（回调丢了时的兜底，官方建议每 5 分钟一次） |
| `POST /sync/save` | D94 进度云同步（**顺带绑定匿名收礼地址 uid**，D113） |
| `POST /sync/load` | 进度取回 |
| `POST /gift/inbox` | **D113 收礼箱**：凭 code→openid→uid 取「别人送我的」 |
| `GET /health` | 健康检查 + 是否已配置 |

## 环境变量（**全部不进代码库**）

```bash
WX_APPID=wx...            # mp 后台 → 设置
WX_APPSECRET=...          # 开发管理 → 开发设置（换 session_key 用）
WX_OFFER_ID=...           # 虚拟支付 → 基本配置
WX_APPKEY_PROD=...        # 现网 AppKey（env=0）
WX_APPKEY_SANDBOX=...     # 沙箱 AppKey（env=1）
WX_ENV=0                  # 0 正式 / 1 沙箱
PORT=8787
```

## 上线前必须做的三件事

1. **用官方示例值验证签名**：把官方文档给的 `uri/postBody/appKey` 跑一遍，
   确认 `sign.js` 输出与官方示例**完全一致**，再往下接业务。不一致就是算法或编码问题。
2. **换持久化存储**：`index.js` 里的 `ORDERS`/`SESSIONS` 是 `Map`，**重启即丢**。
   生产必须换数据库 —— 否则重启后回调重放会**重复发货**。
3. **打开 HTTPS**：虚拟支付回调必须是 HTTPS。

## 三个官方点名过的坑（已在本实现中处理）

| 坑 | 说明 | 处理 |
|---|---|---|
| **uri 不能带参数** | `/xpay/query_order?a=1` 与 `/xpay/query_order` 算出两个签名 | `calcApiPaySig` 强制剥参数 |
| **signData 必须与前端发出的逐字一致** | 含空格与换行 | 由**服务端生成、原样下发**，前端只透传 |
| **sessionKey 必须是最新的** | 用旧的算 `signature` 直接失败（-15007） | 每次下单用 `code2Session` 刷新并保存 |

## 小程序端接线（三步）

1. mp 后台「道具配置」按 `index.js` 的 `GIFTS` 建 4 个道具（productId 与价格**逐字一致**）
2. 部署本服务，拿到 HTTPS 地址
3. `app.injectPaymentConfig({ offerId: '...', orderApi: 'https://你的域名/pay/order', goodsPublished: true })`
