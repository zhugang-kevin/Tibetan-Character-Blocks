# 发布就绪表（2026-10-23）

> 结论先行：**体验测试就绪；发布未就绪。**
> 本表只记录**有证据**的状态；"未做"就是未做，不用"基本没问题"粉饰。

## 0. 一句话结论

| 问题 | 答案 |
|---|---|
| 能不能交给第三方做**体验测试**？ | **能**，附 `docs/third-party-playtest.md` |
| 能不能说"没有任何问题"？ | **不能** |
| 能不能提交审核/发布？ | **不能**，见第 1 节阻塞项 |

## 1. 阻塞项（发布前必须清）

| # | 阻塞 | 现状 | 谁能做 |
|---|---|---|---|
| B1 | 小程序真机/开发者工具视觉与交互 | **未做**。H5 是镜像；最新改动（模式条/墨牌/跳过/文案）未在 WXML/WXSS 真机看过 | 你（DevTools + 真机） |
| B2 | 音频实际播放 | 🟠 **解码/播放时钟已证（96/96）**；真机听感（外放/耳机/BGM duck/蓝牙）未证 | 你（真机） |
| B3 | 类目/隐私/支付/广告 | 🟠 **文档/清单已齐**（隐私填写稿、支付上线单）；MP 后台未配 | 你（MP 后台） |
| B4 | Q1 识认率真实样本 | **n=0**。工具在，数据没有 | 你（找 n≥30 用户） |
| B5 | 最新代码 150 关浏览器全量 | ✅ **已跑完：150/150，0 失败，0 控制台错误，平均 9802ms/关**（24m38s） | 我（已完成） |

## 2. 已就绪（有证据）

| 维度 | 状态 | 证据 |
|---|---|---|
| 静态自检 | ✅ | `validate` 1814/0/2 |
| 小程序页面行为 | ✅ | `test-page-behaviour` 66/0（+⑱ 练习模式滚动断言） |
| 服务端硬化 | ✅ | `test-server-hardening` 18/0（含 R13 遥测写入口限流） |
| H5 端到端 | ✅ | `test-h5` 697/0 |
| 首页旅程 | ✅ | `test-game-journey` 28/0 |
| 150 关逻辑 | ✅ | `test-all-150` 150/150、0 死局；最紧 L6-1 10 对/18 步 |
| 150 关浏览器全量（最新代码） | ✅ | 150/150，0 fail，0 errors，avg 9802ms（D151/D152 之后重跑） |
| 关卡不可悄悄改 | ✅ | `test-level-guard` 12/0（指纹已按 D151 理由更新） |
| 宗教商业化红线 | ✅ | `test-religion-compliance` 41/0 |
| 藏文排版 | ✅ | `test-tibetan` 1392/0 |
| 音频覆盖/响度 | ✅（覆盖/响度） | `data/voices.js` 由目录生成；`validate` 校对表 vs 目录；`check_voice` 53/53；`test-scene-voice` **33/0**（含"五条场景语音文件齐全"） |
| 音频解码/播放时钟 | ✅（96/96） | `scripts/audit-audio-playback.js`：96 个文件逐个 `play()`，`currentTime` 推进；2 个启动慢的文件给足 1.2s 后通过（不是坏文件） |
| 双轨配色 | ✅ | 学习线 1 色 / 游戏线 ≥2 色（page 62→65、h5 697） |
| 首页双入口 | ✅（H5/结构） | journey 28/0；页脚/标题/工具栏口径已统一 |
| 首页 H5 小屏布局 | ✅ | 320×568 / 375×667 / 390×844 / 430×932：双入口与 1 号节点都在视口内，无横向溢出 |
| Q1 网页版 | ✅ | `preview/q1.html`：30/30 达标、29/30 仍达标、CSV 记录表行格式正确、无音频/无提示；320 首屏可见「开始」 |
| 隐私草稿 | ✅（草稿） | `docs/privacy-policy-draft.md` + `docs/privacy-mp-form.md`（可逐项粘贴） |
| 第三方测试说明 | ✅ | `docs/third-party-playtest.md` |
| Q1 工具/协议 | ✅（工具/协议） | `pages/recognition` + `preview/q1.html`（网页版，已实测 30/30、29/30）+ `scripts/q1-report.js` + `docs/q1-recognition-protocol.md` |

## 3. B1 真机/DevTools：本机为什么没跑

- 本机**已安装**微信开发者工具（`C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`）。
- 但 CLI 启动时调用 `reg.exe`，被当前沙箱的**程序黑名单**拦截，错误明确写着：
  「This block cannot be approved or bypassed from the current command.」
- 现状核查：IDE 的 HTTP 服务 `127.0.0.1:29671` 在监听，但**自动化端口 9420 未开**，GUI 进程不可见
  → 没有安全的截图路径，也不绕过黑名单。
- 因此**不能**用 CLI 自动化（`cli auto`）截图；也不能把它包装成"已跑过"。
- 需要你手动做（10 分钟）：

1. 打开微信开发者工具 → 导入项目 `I:\藏趣游戏` → AppID `wx3378038122ee9d54` → 信任。
2. 编译；看 Console 是否有红错（音频/网络警告可忽略，但记录）。
3. 依次截图：
   - 首页（双入口 + 10 节点完整）
   - 学习面板（无"验收用"开关）
   - 练习 L1-1（42 步）
   - 学藏文 L1-1（墨牌）
   - 学藏文 L11-1（3×3 + 长按放大）
   - 结算页（含「跳过等待」）
4. 真机预览（QR）：走 `docs/third-party-playtest.md` 的 P0 八条；**320×568 小屏也要走一遍**（H5 已查，小程序未查）。
5. 把截图/问题按记录表回传。

## 4. B2 音频：脚本能证明什么、不能证明什么

- **能证明**：文件存在、索引与目录一致、53 条响度合格、场景键（`greet_03..07`）有对应文件；
  **96/96 解码 + 播放时钟推进**（`scripts/audit-audio-playback.js`）。
- **不能证明**：真机上的实际出声、BGM duck、蓝牙/静音键、安卓机型差异。
- 真机听感清单：元素发音（配对后 ~300ms）、连击 4+ 祝福、通关祝福、BGM 是否被压低、错配音是否刺耳。
- 录音为真人；母语者复核状态以 D112/D114 记录为准，本表不重复声明。

## 5. B3 合规/隐私/支付/广告

| 项 | 现状 | 说明 |
|---|---|---|
| 敏感权限 | ✅ 无 | `app.json` 无 `permission` / `requiredPrivateInfos` |
| 宗教商业化 | ✅ | 41/0；无实物、无宗教用品 |
| 去游戏化 | ✅ | `validate` §37；入口用「练习模式」，无「闯关/关卡/通关/关」 |
| 隐私指引 | ⚠️ 草稿 | `docs/privacy-policy-draft.md` + `docs/privacy-mp-form.md`；需在 MP 后台"设置→服务内容声明→用户隐私保护指引"配置 |
| 支付 | ⚠️ 未开通 | `config/pay.js`：offerId/orderApi 空、goodsPublished=false；打赏入口隐藏；上线步骤见 `docs/virtual-payment-go-live.md` |
| 广告 | ⚠️ 未开通 | `config/ads.js` 全空；不创建实例、不拉广告 |
| 类目 | ⚠️ 待你确认 | 目标「其他在线视频课程」；实际以 MP 后台为准 |
| ICP/域名 | ⚠️ 待你确认 | 服务端需 https + ICP 备案；当前 orderApi 为空 |
| 遥测读取 | ✅ 已鉴权（R10） | `GET /telemetry`：配 `TELEMETRY_TOKEN` 则校验；未配且生产（`WX_ENV=0`）→ **403 fail-closed**；仅沙箱放行。上线前必须在 env 配 token |
| 遥测写入 | ✅ 匿名 + R13 | 只存 `ver/sess/rows`，无 uid/无 IP；**60 次/分钟/IP 限流 + 日志 5MB 上限**（`test-server-hardening 18/0`）；仍需隐私指引披露 |

## 6. B4 Q1：工具在，数据没有

- 工具：`pages/recognition`（30 题、四选一、无颜色/无发音/无提示；`utils/recognition.js` 80% 达标；n≥30 才报达标率）。
- 发布前可用：`preview/q1.html`（纯本地网页版；`node scripts/gen-q1-data.js` 生成 30 条题库；导出直接是记录表一行）。
- 统计：`scripts/q1-report.js`（n、达标率、95% Wilson CI、前后测增益；已用 32 条模拟数据验证脚本本身）。
- 协议：`docs/q1-recognition-protocol.md` + `docs/q1-sample-sheet.csv`。
- 现状：**n=0**。这不是代码问题，是"还没有真实用户"。
- 在拿到 n≥30 之前，**不能**对外说"玩家学会了藏文"；只能说"配对玩法可用"。

## 7. B5 最新代码 150 关浏览器全量

- 命令：`node .workbuddy/tmp/playthrough-auto.js`（页面 `?auto=lv-stage` 真实对局）。
- 结果（2026-10-23，本轮）：**learn 150 / done 150 / fail 0 / avg 9802ms / errors 0**，总耗时 24m38s。
- 分档：L1–2 23 对 ≈14.7s；L3–5 17 对 ≈12s；L6–10 10 对 ≈8.8s；L11–15 7 对 ≈7.4s。
- 说明：即使全绿，也只证明**H5 镜像**的 150 关流程；**不替代真机**（B1）。

## 8.5 本次新增的交付物

| 文件 | 用途 |
|---|---|
| `docs/third-party-playtest.md` | 第三方体验测试说明（已知限制 / P0 八条 / 记录表 / 严重度） |
| `docs/release-readiness.md` | 本表 |
| `docs/privacy-policy-draft.md` | 隐私指引草稿（数据面 / 目的 / 权利 / 待填项） |
| `docs/privacy-mp-form.md` | MP 后台隐私指引**逐项填写稿**（可粘贴） |
| `scripts/audit-audio-playback.js` | 音频解码/播放时钟审计（96/96；不是听感） |
| `docs/q1-recognition-protocol.md` | Q1 识认率采集协议（单次 + 前后测 / n≥30 / CI） |
| `docs/q1-sample-sheet.csv` | 匿名记录表（code/group/pre/post/lessons/date/device/notes） |
| `preview/q1.html` + `preview/q1-data.js` | 发布前可用的 Q1 网页版（30 题、无提示/颜色/音频；导出 JSON/记录表行） |
| `scripts/gen-q1-data.js` | 从 `data/cards.js` + `data/learning.js` 生成 Q1 题库（30 条、转写唯一） |
| `scripts/q1-report.js` | 读 CSV 出 n、达标率、95% Wilson CI、增益、分组（已用 32 条模拟数据验证） |
| `scripts/test-scene-voice.js` | 加了"五条场景语音文件齐全"覆盖检查（33/0） |
| `server/index.js` | 修正 `GET /telemetry` 过期注释（实现早已按 R10 鉴权） |

## 8.6 已知静态警告（不阻塞）

`validate` 2 条警告，均为已知项：

1. 「字块组合埋点为 V2 玩法占位，暂未接入（符合预期）」——V2 才接，不影响当前。
2. 「证书成就行为硬编码，内容扩充后不会自动更新」——维护性提醒；证书内容扩到 15 级以外时要改。

## 8.7 发布流程风险（本次审计新发现）

| 风险 | 事实 | 建议 |
|---|---|---|
| 工作区未提交 | `git status` **134 项**；`git diff --stat` 55 个文件，**+4145 / −1205** | 交付前要么提交（按路径，别 `git add .`），要么明确"交付物=工作区快照" |
| 一个文件被锁 | `docs/关卡改动日志.md`：`head` / `cp` / `git diff` 全部 **Permission denied**；ACL 正常，判断为**另一个进程独占打开** | 关闭占用它的编辑器/进程（可能是并发会话）；解锁前**不要 commit**，否则日志与指纹会脱节 |

## 8.8 其他已知 P2（不影响本次体验测试）

- **挑战成绩是客户端自报**：`server/index.js` 注释已承认"本地改一个数就能刷榜，服务端复算未实现"。
  未接真实榜单前，不要把它当竞技排名。
- **Q1 n=0**：工具/协议/统计齐了，缺 ≥30 真人；不能编。
- **真机/音频听感**：见 B1/B2，只能你补。

## 9. 发布前检查单（按顺序）

1. DevTools 编译 0 红错；6 张截图齐全。
2. 真机 P0 八条全过；音频听感通过。
3. 隐私指引在 MP 后台配置并生效；类目确认。
4. 支付/广告：要么配置完整，要么保持关闭（当前关闭）。
5. Q1 n≥30，达标率有置信区间；不达标就先改教学，不要改口径。
6. 最新 150 关浏览器全量通过；包体 ≤1860KB。
7. 第三方问题清零（P0/P1）。
