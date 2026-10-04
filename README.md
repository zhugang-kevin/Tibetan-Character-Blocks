# 藏字方块（Tibetan Character Blocks）

> 玩方块，认藏文 —— 基于配对消除的藏文启蒙微信小程序

点击两个相同的藏文字母或文化图标即可消除，每消除一对弹出一张文化知识卡。
通关全部 10 关后可生成专属「扎西德勒」祝福卡，并获得第一张**藏文成长证书**。

## 特性

- 配对消除玩法：6×4 到 6×8 共 10 关，难度递进
- 8 个藏文字母（ཀ ཁ ག ང ཅ ཆ ཇ ཉ）+ 4 个藏文化图标（吉祥结 / 莲花 / 雪山 / 经幡）
- 12 张文化知识卡，仅首次发现时滑出（非阻塞、自动收起）
- **每次配对成功朗读该字发音**（单声部，连击不叠音）
- 连击系统 + 金色特殊方块（双倍积分）
- **藏文成长阶梯与证书**：每 10 关一个阶段，通关颁发证书；等级分金 / 银 / 普通（按正确率门槛），编号 `ZWFK-YYYY-NNNN`，可保存分享
- **文化护照**（总档案）：12 张证书位 + 文化收藏册 + 地区印章 + 现实足迹 + 个人文化图谱
- 文化护照印记（首通第 1 关得「拉萨」印章）
- Canvas 2D 生成可分享的扎西德勒祝福卡 / 藏文成长证书
- 藏文化背景（平铺菱格纹 / 经幡 / 雪山布达拉宫）
- 本地进度存储，无需登录
- 4 个程序合成音效，免费可商用、无版权风险
- 藏文排版规范：断行只在 tsheg( ་ ) 之后，shad( ། ) 永不居行首

## 自检

```bash
node scripts/validate.js         # 小程序静态自检：14 大类 196 项
node scripts/test-tibetan.js     # 藏文排版规则：1392 项断言（无需依赖）
```

```bash
# 浏览器体验版端到端测试（需 jsdom）
NODE_PATH="<node_modules 路径>" node scripts/test-h5.js   # 156 项断言
```

## 两种本地体验方式

### A. 浏览器体验版（零安装，双击即玩）

```
preview/play.html
```

双击用 Chrome / Edge 打开即可。和小程序共用同一份 `data/`，无需安装任何工具。

```bash
node scripts/build-h5.js        # 重新生成（改了 data/ 或 images/ 之后）
```

### B. 微信开发者工具（真正的小程序）

1. 下载安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 「导入项目」→ 目录选本仓库根目录 → AppID 选「测试号」→ 不使用云服务
3. 点编译即可

详见 [`docs/run-local.md`](docs/run-local.md)。

## 目录结构

```
├── app.js / app.json / app.wxss   # 全局配置与藏文字体加载
├── data/                          # 元素库、文化卡（12）、关卡（10）、成长阶梯（12 阶段）
├── pages/index|game|result/       # 首页 / 游戏页 / 结算页
├── pages/cert|passport/           # 藏文成长证书页 / 文化护照页
├── utils/                         # 音效、存储、证书、图标绘制、藏文断行、埋点
├── audio/ images/                 # 音效与品牌 Logo / 背景资产
├── preview/                       # 浏览器体验版（template + 生成物）
├── docs/                          # 运行指南 / 排版规范 / 证书体系 / 上线与商业化
└── scripts/                       # validate / test-tibetan / build-h5 / test-h5
```

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/run-local.md`](docs/run-local.md) | 本地体验指南（两种方式 + 常见问题） |
| [`docs/certificate-system.md`](docs/certificate-system.md) | 藏文成长阶梯 · 证书体系（阶梯 / 等级门槛 / 编号 / 与护照关系） |
| [`docs/tibetan-typography.md`](docs/tibetan-typography.md) | 藏文排版规范（tsheg / shad 断行规则） |
| [`docs/business-model-v2.md`](docs/business-model-v2.md) | **商业化方案 v2**（无广告 · 商家核销 · 公益；含政策核验与合规资金流） |
| [`docs/merchant-system-review.md`](docs/merchant-system-review.md) | **商家合作与核销方案评审**（技术选型纠正 + 合规红线 + 修正后的核销方案） |
| [`docs/release-and-monetization.md`](docs/release-and-monetization.md) | 上线开通指南（主体 / 认证 / 备案 / 商户号材料与流程） |
| [`docs/plan-4.1-review.md`](docs/plan-4.1-review.md) | 4.1 方案专家评审与执行路线 |

## 发布前待办

- [ ] 在微信公众平台把小程序名改为「藏字方块」，上传 `images/logo-144.png` 作为头像
- [ ] 配置 `app.js` 中 `TIBETAN_FONT_URL`（Noto Serif Tibetan 的 HTTPS 地址，未配置时静默跳过）
- [ ] 录制 12 条发音放入 `audio/voice/`（`letter_01.mp3` ~ `letter_08.mp3` + `icon_01.mp3` ~ `icon_04.mp3`）
- [ ] 替换祝福卡 / 证书右下角的小程序码占位框
- [ ] 二期：扩充元素库与文化卡，让第一阶段真正覆盖 30 个辅音字母（见证书体系文档「内容缺口」）
