# 藏字方块（Tibetan Character Blocks）

> 玩方块，认藏文 —— 基于配对消除的藏文启蒙微信小程序

点击两个相同的藏文字母或文化图标即可消除，每消除一对弹出一张文化知识卡。
通关全部 10 关后可生成专属「扎西德勒」祝福卡。

## 特性

- 配对消除玩法：6×4 到 6×8 共 10 关，难度递进
- 8 个藏文字母（ཀ ཁ ག ང ཅ ཆ ཇ ཉ）+ 4 个藏文化图标（吉祥结 / 莲花 / 雪山 / 经幡）
- 12 张文化知识卡，边玩边认藏文
- 连击系统 + 金色特殊方块（双倍积分）
- 文化护照印记（首通第 1 关得「拉萨」印章）
- Canvas 2D 生成可分享的扎西德勒祝福卡
- 本地进度存储，无需登录
- 4 个程序合成音效，免费可商用、无版权风险
- 藏文排版规范：断行只在 tsheg( ་ ) 之后，shad( ། ) 永不居行首

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

## 自检

```bash
node scripts/validate.js        # 小程序静态自检：11 大类 86 项
```

```bash
# 浏览器体验版端到端测试（需 jsdom）
NODE_PATH="<node_modules 路径>" node scripts/test-h5.js   # 61 项断言
```

## 目录结构

```
├── app.js / app.json / app.wxss   # 全局配置与藏文字体加载
├── data/                          # 元素库、文化卡（12 张）、关卡配置（10 关）
├── pages/index|game|result/       # 首页 / 游戏页 / 结算页
├── utils/                         # 音效、存储、图标绘制、藏文断行、埋点
├── audio/ images/                 # 音效与品牌 Logo 资产
├── preview/                       # 浏览器体验版（template + 生成物）
├── docs/                          # 运行指南 / 排版规范 / 上线与商业化
└── scripts/                       # validate.js / build-h5.js / test-h5.js
```

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/run-local.md`](docs/run-local.md) | 本地体验指南（两种方式 + 常见问题） |
| [`docs/tibetan-typography.md`](docs/tibetan-typography.md) | 藏文排版规范（tsheg / shad 断行规则） |
| [`docs/release-and-monetization.md`](docs/release-and-monetization.md) | 上线与支付开通指南 |
| [`docs/plan-4.1-review.md`](docs/plan-4.1-review.md) | 4.1 方案专家评审与执行路线 |

## 发布前待办

- [ ] 在微信公众平台把小程序名改为「藏字方块」，上传 `images/logo-144.png` 作为头像
- [ ] 配置 `app.js` 中 `TIBETAN_FONT_URL`（Noto Serif Tibetan 的 HTTPS 地址，未配置时静默跳过）
- [ ] 录制 8 条藏文发音放入 `audio/voice/`（命名 `letter_01.mp3` ~ `letter_08.mp3`）
- [ ] 替换祝福卡右下角的小程序码占位框
