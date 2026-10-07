# 藏文排版规范（Tibetan Typography Rules）

> 🟢 **状态：有效（硬规则）** · 结论索引见 [`DECISIONS.md`](DECISIONS.md)（唯一真相源）。改动藏文渲染必须重跑 `node scripts/test-tibetan.js`（1392 项断言）。

> 适用范围：藏字方块 全部涉及藏文文本渲染的场景（游戏页牌面、文化卡弹窗、祝福卡 Canvas、分享图）。
> 本规范是硬性规则，任何藏文断行/截字实现都必须遵守。

## 一、两个核心符号

| 符号 | Unicode | 藏文名称 | 中文常见叫法 | 功能 | 类比 |
|---|---|---|---|---|---|
| ་ | U+0F0B | ཚེག (tsheg) | 音节点 / 字间标号 | **跟在每个音节后，分隔音节**，避免连读混淆 | 英文单词间的空格 |
| ། | U+0F0D | ཤད (shad) | 单垂符 / 分句线 | 分隔句子或短语 | 顿号/逗号/分号/句号的综合 |
| ༎ | U+0F0E | ཉི་ཤད (nyi shad) | 双垂符 | 篇末、诗文句末 | 段落结束 |
| ༏ | U+0F0F | ཚེག་ཤད (tsheg shad) | 四垂符 | 卷次、全书终结 | 文档结束 |

**关键认知：tsheg 不是标点，而是分隔符。** 它的书写形态是字与字之间、略靠上的一个小点或小楔形；
藏文没有专门问号与感叹号，疑问句、感叹句也以 shad 结尾。

简单记忆：**tsheg 切分「字」，shad 切分「句」。**

## 二、断行硬规则（本项目实现于 `utils/tibetan-text.js`）

1. **断行只发生在 tsheg ( ་ ) 之后** —— 一个音节绝不能被拆到两行。
2. **shad ( ། )、双垂符 ( ༎ )、四垂符 ( ༏ ) 永不居行首** —— 它们附着在前一音节单元内。
3. tsheg 后紧跟的 shad（如 `བཟང་།`）必须与音节合并为同一个不可拆分单元。
4. 极端情况下单个音节超过行宽（超大字号）：整单元独占一行，不硬拆。

## 三、代码用法

```js
var tibText = require('../../utils/tibetan-text');

// Canvas 自动换行绘制（水平居中）
ctx.font = '500 92px "Noto Serif Tibetan", serif';
tibText.drawTibetanWrapped(ctx, 'བཀྲ་ཤིས་བདེ་ལེགས', cx, topY, maxWidth, lineHeight);

// 只要行数组（自定义绘制）
var lines = tibText.wrapTibetan(ctx, text, maxWidth);
```

WXML 中的 `<text>` 组件由系统排版，不做干预；本规范仅约束 Canvas 绘制路径
（Canvas 的 `fillText` 不会自动按 tsheg 断行，必须手动换行）。

## 四、验证

```bash
node scripts/test-tibetan.js
```

覆盖：tsheg 分词还原性、行首标点禁用（། ༎ ༏）、多宽度断行、音节不拆断。
本脚本只依赖 Node（内置 `assert`），无需安装依赖，改完 `tibetan-text.js` 必须重跑。

## 五、为什么重要

中文/英文排版经验直接套用藏文会出错：Canvas 若按字符硬折行，
`བཀྲ་ཤིས|་བདེ`（tsheg 前被截断）或 `|།བཟང`（shad 落行首）都是藏文排版大忌，
也直接影响藏文用户的阅读体验和产品专业度。

## 六、发音（配套规则）

每次**配对成功**都会朗读该元素的藏文发音（`utils/audio.js` 的 `pronounce`）。
发音与文字排版是同一套「音节」概念：读音单元 = tsheg 切分出的音节。
录音文件命名与元素 ID 一致（`letter_01.wav` ~ `letter_30.wav`，图标为 `icon_01.wav` ~ `icon_04.wav`），
缺失时静默回退，不影响游戏。
