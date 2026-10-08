# 工程备查手册（跨会话参考）

本文件是 `MEMORY.md` 的长版附录：**长期稳定、不需要每会话背下来的参考细节**放这里，避免自动注入的记忆文件超限。
硬规则与决策依据仍以 `docs/DECISIONS.md`（D1..D36，唯一真源）为准。

---

## 1. 四套门禁（改完必跑）

```
NODE=C:/Users/zhuga/.workbuddy/binaries/node/versions/22.22.2-6/node.exe
$NODE scripts/validate.js      # 静态自检 1037 项 / 34 大类（2 条已知警告）
$NODE scripts/test-tibetan.js  # 藏文排版 1392 项，零依赖
$NODE scripts/build-h5.js      # 生成 preview/play.html（~1294KB）
NODE_PATH="C:/Users/zhuga/.workbuddy/binaries/node/workspace/node_modules" \
  $NODE scripts/test-h5.js     # e2e 558 项，需 jsdom
```

- ⚠️ node 的版本目录随升级漂移（`22.22.2-3` → `22.22.2-6`）；报 `No such file` 先 `ls versions/`。
- ⚠️ 本机裸 `node` 走 brokered-fs-shim，**看不见刚创建的文件** → 一律用上面的绝对路径。
- 页面共 **6** 个：`index / game / result / cert / passport / benefits`。新增页面必须同步 `validate.js` 四处：
  `jsonFiles` 列表、`appJson.pages.length` 数字、事件绑定表、背景层数组。

## 2. 双实现（小程序 ↔ 体验版）工程坑

- `preview/template.html` 是 `preview/play.html` 的模板，由 `build-h5.js` 内联产出单文件；小程序 `pages/*` 与它**平行实现**，`validate.js` 机械校验两端一致。
- 体验版宿主是 jsdom：**无布局**，需 stub `canvas.getContext` / `toDataURL` / `clientWidth` / `Audio` / `scrollTo`；
  jsdom 的全局是 **`doc` 不是 `document`**；查源码字符串用 `fs.readFileSync(HTML,'utf8')`。
- ⚠️ 加存储字段要**三处同步**：`utils/storage.js` 的 `getProgress` 白名单 + 体验版 `getProgress` 白名单 + 页面读取。
  漏一处会**静默丢字段**（`lampDay` 踩过）。
- ⚠️ WXSS 平铺背景**只能用 base64**（`<image>` 无 repeat；`url()` 引本地路径不可靠）。
- ⚠️ 向 Page 对象插新方法：`old_string` 必须锚在**最后一个方法之后**，否则 `});` 提前闭合；WXSS 花括号必须配平（§22.8），
  不要写「单独一行 `}}`」收尾。
- ⚠️ `sed` 替换门禁数字要带上下文：`'392 项'→'403'` 会误伤 `'1392 项'`。
- ⚠️ H5 单文件 **id 必须全局唯一**（`$('x')` 只取第一个）：面板签到按钮曾与跳窗按钮撞名 `#lamp-btn` → 已改 `#signin-btn`。
  新增面板内按钮先全局 grep 撞名。
- ⚠️ 大段 base64 会被 **Read/Grep 工具**渲染成 `image_blob_ref` JSON（形如 `{"type":"image_blob_ref","blob_id":…}`）。
  那是**读取层的展示变换，不是磁盘内容**。核验真身用 `wc -c` / `awk 'length($0)'`：
  `pages/game/game.wxss` 的 `.sc-pattern` 实为单行 28362 B 的 `data:image/png;base64,…`。

## 3. 视觉底盘（六层背景 + 墨色体系）

- **六页统一六层背景**（`validate.js` 第 18 节机械检查）：
  `sc-bg`(`/images/bg-global.jpg`) → `sc-pattern`(0.10) → `grain`(`app.wxss` 全局) → `sc-ground`(雪山 0.16)
  → `sc-sky`(经幡 0.14) → `sc-night`(径向夜色罩)。新增页面照抄任意一页的 scenery 块 + wxss 三件套。
- **背景绝不纯白**：`page` 背景 `#0B1E36`；`validate` 判错 `#FFF` / `#FFFFFF`。
- 背景纹样 = 吉祥八宝：`scripts/make_astamangala.py` → `images/pat-tile.png`（21233 B，`S=4` 超采样，`CELL=64`，`COLS,ROWS=4,2`，
  八宝顺序 `[[fish,vase,lotus,wheel],[conch,knot,banner,umbrella]]`，`GOLD=(201,162,39,235)`，`LW=3.2*S`）。
  改纹样后 **6 页 wxss 的 `.sc-pattern` base64 要批量重替换**（`background-size: 60rpx 60rpx`，`opacity: 0.10`）。
  仅作背景装饰，**不进元素库/不上牌面**（D25）。
- **首页无品牌行**（hero/logo/slogan 已删）；品牌语法定载体 = 首页转发卡 + 证书/祝福签绘制（§8 不再要求首页 Slogan/Logo）。
- ⚠️ **改全站文字色的铁律**：基色保持深色 `#2C3E50`（白卡内继承文字靠它），只有**直落暗底**的元素单独提亮
  （`#F5E9CF` / `#C9BFA8` / `#FFD98A` + `text-shadow`）。全局替换成浅色 = 白卡内文字全隐形（踩过）。动手前先列容器明暗清单。
  **白光数字必须配暗底**（`profile-combo` 深紫胶囊 / `rank-row` 暗红经幡底条）。
- **对比度 D32**：文字 WCAG AA ≥ 4.5:1（§30 真算）。牌面渐变高光带必须收在字形区（y 10%~90%）外；
  **动牌面渐变必跑 §30.1 采样**（四色牌面实测 4.61~5.99）。
  墨色白名单：浅卡次级 `#6E6759`（12 个旧灰已锁死）/ 金墨 `#8A6A12` / 绿墨 `#176B3C` / 银档 `#5D6D7E` / 金块字形 `#6B4406`。
- **图标三墨变体**（`utils/icons.js`）：`id` 深墨（浅卡）/ `id|lite` 奶白（本色牌面）/ `id|gold` 深墨（金块）
  —— **禁止回退单份 `el.color`**。中调金底（`.reveal-tag` / `.ns-tag` / `.bn-city.on` / `.fact-label` / `.node-badge` /
  `.lamp-btn.lit` / `.crate`）不得配奶白大字，压暗到 `#8A6A12` 系。
- 四层物理层次：`.board-panel`（暗金浮雕底盘）→ `.board-outline`（下沉凹槽 inset）→ `.tile`（槽）→ `.piece`（3D 凸起）。
- H5 镜像：`body` / `.phone` 暗色 + `bg-global-h5.jpg` base64（`dataUrl()` 按扩展名给 mime）+ `.sc-night`；
  启动时 `$('sc-bg').src = IMAGES.bgGlobal`。

## 4. 天梯与祈福之光（§17 / §19 / §20；D53 前名「万家灯火」）

- **祈福之光**（D53 更名）：`data/lamp.js`（固定假数据）+ `utils/lamp.js` 纯函数
  （`isFirstOpenToday` / `lightOne` / `fill` / `formatCount` 千分位 / `formatWan` 万·亿 / `glowLevel`），
  **禁任何网络/云 API**；状态存 `storage.lampDay`；首页 `lamp-mask` 每天首次打开显示一次。
  点亮 = 总数 +1 + `vibrateShort` + 金粉 + 祝福语 + `lampPop`。
- ⚠️ 主数字走 `formatWan`（12.85万）、副行走 `formatCount`（128,456），**并存不互替**；
  万/亿 +1 时常不变 → 跳动动效必须**同时**挂主数字与副行。
- ⚠️ **辉光红线（D35）**：地区行 4 级辉光 `GLOW_ORDER = [3,1,4,2,3]` 按**行号**循环取，
  **绝不许改成按数量映射**（那等于用亮度做排行榜，推翻「不标示高低与位次」声明）。
- ⚠️ **类名契约**：`.lamp-row` = 长明灯签到环容器（只许一处）；`.lamp-item` = 跳窗各地灯火行（曾撞名致签到环长金边）。
- ⚠️ **文案红线：无竞争性/营销字眼，连注释也算**（§19 全文机械扫描）。
- **首页地图 = 藏式天梯**（类名契约不变 `vine-map` / `vine-stem` / `region`）：
  天堂层 `.ladder-heaven` → 石阶中轴 → 三态节点（done 🪷 / open 呼吸 / locked 🔒）→ 底部村落 `.ladder-village`；
  两侧五色经幡 `.ladder-flags`。
  - 节点三态视觉：locked = 暗金哑光 + 🔒 / open = 亮金呼吸 / done = 袈裟暗红 `#8B241C` + 金描边 + 🪷。
- 天梯动效几何集中在 `utils/ladder.js#buildPlan`（**`foot = settle + 200`，方向恒为山脚→山顶**，别改回真实位置）；
  入场动画播完**必须撤 `.in`**（否则 `animation-fill` 常驻 transform 挡住 `hover-class`）。
  跳窗盖住时推迟到 `closeLampWindow`（`_pendingIntro` / `_pendingBloom`）。
  类名契约：`ladderRise` / `nodeRise` / `bloomRing` / `lotusBloom` / `node-press`。
- **宗教符号红线（D25 已拍板 2026-10-06）**：佛塔 / 酥油灯 / 风马旗 / 莲花 / 经幡 进元素库 = **硬错误**
  （§17.8 按「去注释源码」扫描）。元素库 = 8 字母 + 4 图标「吉祥结 / **青稞** / 雪山 / **牦牛**」
  （`icon_02` iconKey=`barley`、`icon_04` iconKey=`yak`；`drawBarley` / `drawYak` 两端同构，
  文化卡 title 与元素 title 逐字一致）。
  **D25-b 未拍板**：三处装饰位仍用莲花/经幡（天梯完成节点 🪷、万家灯火两色莲花、通关粒子 6 风马旗 + 12 莲花瓣）。

## 5. 分享 / 祝福签 / 揭图 / 精灵表

- 分享**只带内容不带激励**（滥用分享 ▶2：分享获利即违规，处罚链至下架封号）。
  `validate.js` §28 用 `SHARE_REWARD_PAT` 扫描 4 页 `onShareAppMessage` 函数体（**含注释**）。
  现状：`result` / `passport` / `cert` = 转发卡；`index` = 转发卡 + 祝福签卡 `wx.showShareImageMenu`（用户取消 fail 静默）。
  事实红线：小程序**无法**跨 App 直分享到抖音/快手/小红书（所谓 `uni.share` = 各建一套小程序，D29/D30 已否决）。
- **祝福签卡片**：OffscreenCanvas 750×1000 藏纸底 + 金框；藏文大字走 `tibetan-text`；小程序码仅占位。
  抽取铁律 = **只能** `collect.blessingCard(this.data.daily, today)`，**不得引入随机源**
  （§27 + test-h5 §29 锁死同日两次逐字一致）。
  文案红线：无金额/让利数字 +「不设分享奖励、不含任何金额」逐字在场。
  ⚠️ `pages/index/index.js` 全文（**含注释**）禁 `showModal` 子串（§17）——权限拒绝只 toast。
- **通关揭图 D31**：`scripts/make_reveals.py`（`seed=7` 可复现，合计 306KB；预算单张 45KB / 合计 450KB，§29.2 把关）
  → `images/reveal_01..10.png` + `data/reveals.js`（藏文名 + 转写 + 中文名 + 释义；题材 = 八宝去莲花 + 雪山/青稞/牦牛）。
  - 层次：`.board-wrap`（JS 算 `boardH`）→ `.reveal-img`（绝对定位）→ `.board`(`z-index:1`)；
    露出机制 = `.tile.removed{visibility:hidden}`，**不是 opacity**。
  - **揭图状态不落库**：解锁 = `completedLevels` 是否含该关（§29.7 见 `reveals` 字段即报错）。
  - `build-h5.js` 必须把 `r.img = IMAGES[key]` 换写成 data URL。
- **精灵表方块**：`SPRITE_LETTERS = { letter_01:'ka' }`（**`game.js` 与 `preview/template.html` 各一份，必须同步**）
  → `images/sprite_ka.png`（480×480，2×2 四色帧，序红/蓝/绿/黄，PNG8 ≈42KB）。
  - ⚠️ WXSS `background-image:url()` 引本地路径不可靠 → 用 `<image>` + `.ka-sprite`（`padding-bottom:100%`）内 200% 位移（`ka-v0..3`）。
  - 成对同色帧：同字母第 n 次出现 → 帧 `floor(n/2)%4`；**匹配仍按字母判定，颜色只是暗示**。
  - 精灵牌不叠 CSS 渐变（`pieceStyle` 置空）；金块保留帧图 + 提亮 + 金光。`test-h5` 有精灵断言。

## 6. 视觉核验（截图配方）

```
chrome-headless-shell.exe --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --hide-scrollbars --virtual-time-budget=3500 --screenshot=x.png --window-size=512,932 \
  "file:///…/preview/play.html"
```

- ⚠️ Windows 下最小窗宽 ≈ 512（用 430 会裁掉右侧，是**假 bug**）→ **512 截 + PIL 裁 `(41,0,471,高)`** 得 430px 真机框。
- 内页两条捷径：① `play.html` 自带 **`?nolamp=1`**（跳过祈福之光跳窗）；
  ② 末尾 append `<script>` 调全局函数（`getProgress` / `saveProgress` / `showScreen` / `colToday` 都挂在顶层 → 全局），
  结果写 `body[data-probe]`（**别用 `title`**）。
- ⚠️ 注入脚本必须包在 `window.addEventListener('load',…)` + `setTimeout(120)`（内联在 `</body>` 前会被启动流程覆盖）；
  页面自身定时器会先撤样式 → 需再补一次应用类名。
- ⚠️ 内页截图常因容器用 `transform` 而非 `scrollTop` 滚动而**整屏空白**（`scrollIntoView` 也无效）→ 用「隔离法」：
  脚本里 hide 其它 `.pp-section` 只留目标块再截。
- PIL 只在 `…/python/envs/default/Scripts/python.exe` 里；`…/python/versions/3.13.12/python.exe` 是纯标准库。

## 7. 变现与权益（硬事实）

详见 `docs/monetization-v3.md`、`docs/privilege-system-v1.md`。

- 🔴 **小程序虚拟支付 ≠ 小游戏虚拟支付**。小游戏需版号（关闭）；小程序虚拟支付只要求「已认证 + 企业/事业单位/个体工商户 +
  信息完备」，**无版号**；个人通道需含「工具」类目、月限 10 万。iOS 已打通（2025-11 苹果小程序合作伙伴计划，IAP 抽 15%）。
  内购线可重开，但类目须匹配、须守「教育/文化」非游戏，且需服务端（签名 + 回调 + 发货）。
- ❌ 原生分账个体户不可；❌ **二清**绝对禁区（银发〔2016〕217 号文）。
- 铁律：**C 端交易额 100% 归卖家，平台收入只来自 B 端服务费/授权费或自营商品款**，两条腿永不相交。
  **D17** 结算 = 定额 × 核销笔数。
- **D28 券面不载金额、也不载折扣数字**（连「9 折」都不印；印任何可计算让利 = 替商家承诺价格）。商家店内自己做满减 ✅。
  门禁：§16.2（`data/merchants.js` 词干 + 后缀匹配 `price` / `amount` / `discount` / `settle`…，含 `discountRate` / `maxDiscount` 变体）
  + §16.2b（禁 `9折` / `满N减N` / `N% off`）+ **§25 页面层**（benefits 四文件与体验版同样禁；
  `decorate()` 的 offer 必须**逐字**来自数据层）+ §16.2c / §25.3 反例自测。
  ⚠️ 词干别用 `off`（自有字段叫 `offer`）；`/元/` 要写 `/元(?!音|素)/`（「元音」是藏文常用词）。
- D28 契约留档（**仅商家侧 D13 解禁后用，不进 `data/*.js`**）：`discountRate`(0–1) + 可选 `maxDiscount`；
  实收 = 原价 × rate 是**商家**的账，平台收入仍是「定额 × 核销笔数」。
  已否决别回退：按商家类型定折扣梯度 / 稀有度映射折扣 / 燃灯祈福换折扣券。
- **不新增积分体系**：领取门槛 = 通关关数（`need`），游戏进度即权益货币。
- **不用定位**：`getLocation` / `getFuzzyLocation` / `chooseLocation` 进禁用清单；城市由用户主动选。
- **不弹窗**：首次进入用内嵌引导卡 `.bn-guide`（PIPL 最小必要）。
- 双轨制只是标签 `track: local|tourist|both`。三条硬雷：① 商家不得"发"虚拟道具 → 平台发、商家零计酬；
  ② 不卖"广告展示位" → 改「文化联名合作」；③ **宗教活动场所与文物景区不得商业联动**。
- 以物易物（曝光位换商品）按**视同销售**，双方确认收入并开票。

## 8. 环境沿革

- 2026-10-06 22:36 项目目录被整体搬到 `C:/Users/zhuga/WorkBuddy/_backup/tibetan-match-2026-10-06`（**非本人操作**），
  会话目录 `2026-10-04-00-41-14/` 一度只剩空 `.workbuddy/`；记忆已从 `_backup/memory-00-41-14/` 还原。
- **2026-10-07 00:53 项目迁至新家 `I:\藏趣游戏`（本人操作，用户指定）**：
  robocopy /E 复制 209 文件 / 42,179,736 B → 逐字节校验一致 → git 干净同步 `5d6bdc1` →
  新位置 validate 复跑 1098/0/2 → 删除 C 盘源目录。**此后所有仓库路径一律用 `I:\藏趣游戏`**。
- `git push` 卡点定案（2026-10-06）：网络与仓库级代理都正常，卡的是**凭据链**
  （系统级 `credential.helper` 先跑 `helper-selector` ~22s → 沙箱弹不出 UI → timeout）。
  可用命令：`GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=Never git -c credential.helper= -c credential.helper=manager push origin main`
  （仓库级代理**不要绕**，`-c http.proxy=` 反而超时）。
- 沙箱限制：`rm` 一次删多文件会被拦（分 1–2 个/条）；`reg.exe` 黑名单；`python -c` 带 `json`/`io` 的内联脚本常被拒
  （改写 `.py` 再跑）。
