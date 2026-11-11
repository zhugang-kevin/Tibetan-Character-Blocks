# MEMORY.md — 藏趣游戏（藏字方块 / tibetan-match）

> 2026-11-09 精简版。**细节唯一事实源 = `docs/DECISIONS.md`**（冲突以 DECISIONS 为准）。
> 本文只留「每次必须遵守的规则」与「当前真实状态」，历史推演看 DECISIONS。

## 0. 现状速览

- 微信小程序「藏字方块」：老线 10 关（练习）+ 学习线 150 课；通关揭图 50 座寺院（150 课循环）。
- 主包 **1710KB ≤ 1800KB**（validate §38）；四道门禁：validate **1830/0** · 广告运行 **93/0** · 广告变异 **37/0** · WXML/WXSS **33/0**。
- 全量 CI **45 通过 / 0 失败 / 1 跳过**（2026-11-11，9m01s，D178 落地后复跑）；`pre-commit` **10 道全绿**。
- 决策最新编号 **D178**（D178 = 道具图重做 + §67 门禁 + 体积守卫修 bug）。
  🔴 **落号前必须三处交叉查最大号**（台账 / 提交说明 / 全库引用）：`DECISIONS.md` 只到 D156，
  但 **D157–D177 已被占用**（D170 定位纠偏 / D171 橱窗三档 / D174 电商合规 / D176 订单 / D177 实物下线）且**台账里没有对应行**（已知缺口）。
  → 下一个可用号 **D179+**。（`D700` 是色值不是编号。）
- **发布未就绪**：缺 ICP 备案、APPID/APPKEY_PROD、真机验证、体验版上传。阻塞台账 `docs/上线阻塞与边界-2026-11-09.md`。

## 1. 硬规则（违反过的，不要再犯）

| 规则 | 说明 |
|---|---|
| **决策编号** | 落号前**跨三处**查最大号：`DECISIONS.md` 末尾 + `git log --all --pretty=%s` 提交说明 + 全库代码/文档引用（**D157–D177 已被占用但台账无对应行**，下一个可用号 ≥ D179）；新增决策必须写清「未做」项 |
| **任务绑定** | 一段对话 = 一个任务；越界改动先说明再动手 |
| **只改一半 = 新冲突** | 撤/换体系必须同查：模板 / canvas / `<img alt>` / `.json` 标题 / 分享文案 / 注释 |
| **关卡不可悄悄改** | `data/level-fingerprint.json` 存总哈希 + 逐关哈希；改关卡须 `--update --reason="…"` + 追加 `docs/关卡改动日志.md` |
| **关卡域边界** | 只对 `{data/affixes.js, data/learning.js, utils/learning.js, utils/board.js}` 实质改动；判定 = `test-all-150` + `test-level-guard` 全绿 |
| **删代码块后必查语法** | 边界探测会停在函数内第一个 `}`，留孤立括号 → 构建崩；抽 `<script>` 做 `node --check` |
| **反向门禁先过 `stripComments()`** | 判据写「某标识符不该出现」时，自己的解释性注释会把自己判红（实测两次） |
| **大文件用 Edit 逐块改** | Python 正则删 CSS 已两次删到文件末尾 |
| **提交按路径暂存** | `git add <具体文件>`，绝不 `git add .`（工作区常有并发线半成品） |
| **门禁必须挂 CI + 钩子** | 不挂 `scripts/ci.py` 的门禁等于不存在；新门禁必须做变异测试 + 反向自测。**假红比假绿更致命** |
| **不要凭单一 grep 下结论** | 门禁会拼路径后 `read()`；判断能不能删要 grep + 真跑一遍门禁 |
| **扫描必须排除临时副本** | 2026-11-08 `.workbuddy/tmp/ad-mut/utils/payment.js` 被当源码扫到 `wx.login` → CI 假红。三处 walk 走 `SKIP_DIRS`（含 `.workbuddy`）+ 范围自证 |
| **「全红」也可能是假绿** | 快照键不匹配 → 30 个用例全因同一残留翻红。必须**每例先跑基线自证绿**；锚点失效判失败 |
| **不编数据** | 价格 / 资质 / 年代 / 寺庙信息查不到写「未核验」，绝不填占位 |
| **沟通口径** | 结论先行，事实带出处 + 查询日期；硬要求给「满足路径 + 成本」；未做写「未做（如实留档）」 |

## 2. 定位（D170，最高优先级，压过一切旧表述）

**卖的是「藏文化相关配饰 / 装饰艺术」，不是宗教用品。做文化宣传，跟宗教无关。**

- 标题公式：`藏式装饰画 · {题材}题材` / `藏式纹样挂件 · {纹样名}` / `雪域日签 · {N} 张一套`；「题材」不能省。
- **禁用词**：开光/加持/灌顶/供奉/礼佛/供养 · 保佑/消灾/转运/招财/辟邪/镇宅/护身 · **佛像/神像/圣物/法器** · 手绘/矿物色/非遗（未证实前）。
- 结构：装饰画 55–70（主推）+ 配饰 9–39 + 纸品 5–19。旧表述「唐卡=佛教题材卷轴画」**作废**。

## 3. 变现（D134–D147）

- **虚拟支付 → 广告**。实物藏香 D147 已放弃、代码全删，由 `test-religion-compliance.js §12` 反向守住。
- 主体 = 科技有限公司；**无《增值电信业务经营许可证》** → 不做平台/多商家，只自营 B2C。
- 🔴 `docs/incense-*.md`、`docs/ecommerce-compliance-runbook.md` **不能挪**：门禁 `read()` 它们当反面教材（试过归档，41/0 掉 30/6）。
- D5「全程不做广告」已被 D138 + D156 覆盖。「教育类目」走不通；可走「其他在线视频课程」。
- 小游戏 vs 小程序：小游戏 IAP 必须版号；IAA 不要版号；类目一旦选游戏永久不能改。

## 4. 两条线（不能混）

- **老线 10 关**：三消、彩色牌、`completedLevels`/`stars`，无步数预算。
- **学习线 150 课**：统一墨牌 `#2C3E50`（字 `#FFF6DC`），颜色不编码字母；`learnDone` 独立；步数 1.8×。
- 🔴 进度不合并；配对成功 ≠ 认字；不要把游戏线颜色去掉。
- 解锁唯一口径 `learnLocked(lv)`（两端同名同规则）：老线 10 关全通 → L2 直接开。
- 首页必须有「全部课程 · 150 课」全景图；量词用**课**不用「关」（FORBIDDEN37 连单字「关」都拦）。
- **功能存在 ≠ 玩家看得见**：玩家说「还是停在 10 关」，先查展示再查实现。

## 5. 通关揭图（D153）

- 唯一数据源 `data/reveal-temples.js`；`game`（遮罩）/ `result`（揭晓卡）/ `passport`（图鉴）+ H5 镜像同源。
- 池子 50 座：`verified === true` 46 座 + `atlas: true` 4 座；雍布拉康出池（宫殿不是寺院）。
- 150 关循环复用，第 51 关起 `reused: true`；学习课不显示揭图。
- **CC 署名是硬义务**：逐张 `作者 / 协议`；门禁 `test-reveal-pool.js`（10 项）。

## 6. 包体 / 分包

- 主包 **1710KB ≤ 1800KB**；分包 `package-praise`(语音) / `package-service` / `package-temples-1|2`（各 25 张 webp）。
- 寺庙图 620px / q68 webp；未采用 68 张在 `assets-src/temples-unused/`。
- 分包图必须 `wx.loadSubpackage` 预下载（app.js + 游戏页 + 结算页），成功回调重设 `reveal.img`。
- 🔴 **预算再涨先做瘦身审计（top10 + 逐项理由）再谈数字**（1846/1852/1860/1960/1800 口径不同，别混用）。
- `data/incense.js` 在 `packOptions.ignore`，是门禁专用事实源，运行时不得 require。
- 🔴 **`packOptions.ignore` 的 folder 型 value 是「相对项目根的路径」**（`images/gift-icons`），不是裸目录名。
- **D178 道具图（虚拟支付后台「添加道具」上传用）**：`images/gift-icons/{tib_lamp_1,tib_blessing_3,tib_khata_6,tib_name_99}.png`，
  硬规格 PNG/JPG **200×200 <200KB**；**只上传、不进包**（在 ignore 里）。house style = **深漆地 + 高对比主体**
  （微信付款弹窗是**白底**，浅底图会直接消失）。构建脚本 `scripts/build-gift-icons.py` 入库，
  **重跑逐字节相同**（khata `72dd2df3d188…` / name `ebf0d92ae1bb…`）；底图源在 `.workbuddy/tmp/icon-gen/`（不入库）。
  🔴 **藏文必须用 Chrome + NotoSerifTibetan 渲染**（PIL 无 raqm → 断笔字，勿用 PIL 出藏文）。
  门禁：`validate §67`（PNG magic / 200×200 / <200KB / 四角 9×9 补丁平均亮度 <140 / 已排除出主包 / 构建脚本存在），变异 5 例全红。
  **用户上传后台时只上传图片本身**（改名 = productId + `.png`）。

## 7. 广告（D138 + D156）

- 6 类 ID 全空 = 未开通；空值不建实例、不拉广告、不报错。**收益不估算**（竞价定价，官方不承诺单价）。
- 运行链路：`utils/ads.js` + 结算页 `<ad ad-type="video">`（banner 退路）+ 游戏页激励「看一段·得一次提示」。
- 🔴 **`WIRED` 表是「哪几类真接线」的唯一事实源**：已接 `video`/`banner`/`rewarded`；未接 `interstitial`/`videoPatch`/`template`，填了 `check-ads-config.js` 直接判红（填了不报错、不渲染、也没收入 = 最难发现的失败）。
- `binderror` **只隐藏父容器、不移除 `<ad>`**；失败态按位记（`videoFailed`/`bannerFailed`）；`.ad-label` ≥26rpx。
- 🔴 **结算页广告位必须首屏可见**（成绩区之后 y≈299）；放内容末尾要下滑 668~1108px = 等于没有广告。门禁查 DOM 顺序。
- 激励入口在盘面下方文档流；热区 **≥104rpx**，必须 `<view>`+`display:flex`（`<text>` 撑不出最小高度）；`show()` 只在 bindtap 回调里；每课 ≤1 次；只有完整看完才扣。
- 结果必须是 `{ok, reason}`：`ended/skipped/error/failed/busy/destroyed/aborted/timeout`（页面另有 `exception`）。只有 `ended` 发奖。**拉不到就说「没加载出来」，不许赖玩家「没看完」**。`onHide` 必须 `abort()`。
- 🔴 **看门狗两段 + 补发一段**：起播 12s + 播放 180s（缺一段就留一个永远转圈的按钮）+ **超时后 90s 补发窗口**：窗口内迟到的 `onClose(isEnded)` 补发一次且仅一次；新观看 / `abort` / `destroy` / `onError` 立即关窗。**取舍**：>270s 才回来的仍作废（宁可收口，不让旧回调凭空发奖）。
- 🔴 页面异常三条路归一：`Promise.resolve(show()).then(done, onReject)` + try/catch + 幂等 `settled`；异常统一 `reason:'exception'` **并进漏斗**（否则「有 tap、无结局」断流）。
- 发奖收敛为唯一入口 `grantAdHint(late)`（`pages/game`）；次数是幂等闸门，补发不可能叠加。
- 漏斗：`ad_hint_tap` / `ad_hint_grant{late?}` / `ad_hint_fail{r}` / `ad_slot_error{slot}`。🔴 只带原因与位次，**绝不带广告位 ID / 账号 / 内容**。
- 🔴 隐私：两份文档只写**条件句**（未配置→不展示；配置后→仅微信官方组件），**不许写死「当前不展示」**（一填 ID 就是假话）。未成年人条款不承诺「零广告」。
- 🔴 红线：不得「看广告送酥油灯/哈达/道具/学习得分」= 绕开虚拟支付的违规套利。只能换游戏内一次提示。
- 官方口径（2026-11-07）：流量主 **UV ≥ 500 且无违规**；必须点击触发；奖励只看 `res && res.isEnded`；`unit-id` 与类型必须匹配。

## 8. 门禁清单

```
node scripts/validate.js                 静态总门禁（1817 / 0，2 条已知警告）
node scripts/test-wxml-lint.js           WXML/WXSS 结构（33 项，含 9 项自证）
node scripts/test-level-guard.js         关卡指纹 + 依赖闭集 + 密封沙箱
node scripts/test-reveal-pool.js         揭图池可信性（10 项）
node scripts/test-content-consistency.js 术语/数量/悬空引用/两端分叉
node scripts/test-all-150.js             150 关可通关
node scripts/build-h5.js && test-h5.js   体验版端到端（701 项）
node scripts/test-ad-runtime.js          广告运行链路（93 项）
node scripts/test-ad-runtime-mutation.js 广告门禁变异（37 项逐例自证，约 15s）
node scripts/check-ads-config.js         广告位配置（D138）
node scripts/ads-readiness.js            广告就绪度报告（代码侧 / 外部阻塞）
node scripts/playthrough-all.js          全 10 关真点通关（约 5 分钟）
node scripts/selfcheck-backend.js        后端真启动 + 30 项接口契约
python scripts/ci.py                     全量（约 9 分钟）；--fast 跳过真点通关（2026-11-07 修过 FAST_SKIP 假快）
```

- 手动跑 H5 测试：`export NODE_PATH=C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules`。
- CI 顺序：读 `preview/play.html` 的测试必须在 `build-h5.js` 之后。
- 钩子：`.githooks/pre-commit`（10 道快检）/ `pre-push`（全量）；`sh scripts/install-hooks.sh`；**fail closed**。
- 变异测试临时根 = `os.tmpdir()/zangqu-ad-mut-<pid>`，**不再往仓库写副本**。
- H5 三消镜像 `M3_ON = location.search 含 m3=1`；三消死局必须池感知重洗，3×3 纯排列无解。
- 音频响度写/验对：`normalize_voice.py` ↔ `check_voice.py`；修红走写方。

## 9. 部署 / 备案

- 后端 = 自建 `server/`（Node ≥ 22.5，`node:sqlite`；`PORT` 默认 8787，生产 8300，**绑 127.0.0.1**）。
- 密钥走 `/etc/dorjea/env`（root:root 640）+ `EnvironmentFile=`，**绝不写 `Environment=`**。
- 服务器 47.93.122.222 与 `guixinkeji.cn` 共享；**只增不删**：不动 `wx-eco` 的 nginx/service/数据。
- 备案：`guixinkeji.cn` 已通过；`dorjea.cn` 审核中。备案未下前 80/443 不可用；证书 DNS-01。
- 硬要求：https/wss 唯一、必须 ICP、不能 IP/localhost、不支持父域名、TLS ≥ 1.2、`api.weixin.qq.com` 禁配。

## 10. 已知未解决（不要假装已解决）

1. **真机没验过**：分包 `<image>` 跨包路径、首关时序、样式最终渲染 —— 只能扫码通关。
2. **APPID / APPKEY_PROD 未提供** → 虚拟支付全废，代码里是「隐藏入口」而非假按钮。
3. **流量主未开通**、3 个广告位未建未审未填 → 页面零渲染、收入 0。代码侧已由 92/37 项门禁证明；外部步骤见 `docs/上线阻塞与边界-2026-11-09.md`。**收益不估算。**
4. 50 座里只有 24 座有藏文名、0 座有拉丁转写 —— 不编，缺就留空。
5. 旧 10 张自然题材揭图仍在主包（兜底），退休要同步改 validate §29 的 15 条规则。
6. `validate` 2 条已知警告：V2 字块组合埋点未接、证书成就行为硬编码。
7. 服务端 P2：挑战成绩客户端自报，防作弊未实现。
8. **上传体验版**：沙箱拦 `reg.exe`，`cli.bat upload` 只能用户手动做。

## 11. 通用坑

- 终端中文乱码 ≠ 文件损坏：先按字节扫（本项目实测 0 处）。
- `wx:else` 必须**紧跟** `wx:if`，中间插节点 → code 10（不给行号）；`test-wxml-lint.js` 已能静态拦。
- WXSS 的 code 10 连 `validate` / `node --check` 都查不出；改完 WXSS 先跑 `test-wxml-lint.js`，再真机 upload。
- 小程序 `<image>` 只能引用包内文件或已备案域名；`upload.wikimedia.org` 不可能进白名单。
- `wx.loadSubpackage` 幂等；分包未就绪时 `<image>` 空白且**不会自动重试**，要重设 `src`。
- H5 的 `dataUrl()` 可按任意仓库相对路径内联（含分包目录）。
- 访问 `commons.wikimedia.org` 走代理 **`http://127.0.0.1:10809`**（HTTP 口；SOCKS 是 10808）。
- 🔴 `scripts/audit_combinations.js` **不能审真实寺院名**：附加字表只覆盖课程音节，`བསམ་ཡས་`（桑耶寺）会误判。
- 推送不稳定用 `git -c http.version=HTTP/1.1 push origin HEAD`。
- 🔴 **PIL 无 raqm → 藏文一律走 Chrome**（`features.check('raqm') == False`；PIL 直出是断笔字）。用 `scripts/render-tibetan-text.js` 或 `scripts/make_logo.py` 的路子。
- 🔴 **门禁里「算体积 / 扫目录」的排除逻辑必须抽成唯一函数给正向检查与反向自测共用**（抄一份 = 自测测自己 → 假绿）。同理：ignore 匹配必须同时认**相对根路径**与裸目录名。
- 判据阈值要**留余量**：取单像素会被角上花纹顶到临界点 → 将来重跑脚本假红；改取 9×9 补丁平均。
- 变异测试**不要删文件**：Windows 跨盘 `mv` 会失败、删了又还原不了；用「移走 + 还原」。资产类改动**先让脚本可复现**（入库构建脚本 + 源图在手），被 SIGTERM 打断也能按位还原。
- 长门禁脚本在 bash 工具下 **120s 会被 SIGTERM**（实测 `validate.js` 单跑 ~30s）→ 一律 `run_in_background`，别前台硬等。
