# 藏文排版规范（Tibetan Typography Rules）

> 适用范围：藏字方块 全部涉及藏文文本渲染的场景（游戏页牌面、文化卡弹窗、祝福卡 Canvas、分享图）。
> 本规范是硬性规则，任何藏文断行/截字实现都必须遵守。

## 一、两个核心标点

| 符号 | Unicode | 名称 | 功能 | 类比 |
|---|---|---|---|---|
| ་ | U+0F0B | ཙེག (tsheg)，音节点 | 跟在每个音节后，分隔音节 | 英文单词间的空格 |
| ། | U+0F0D | ཤད (shad)，单垂符 | 分隔句子/短语，也可作问句、感叹句结尾 | 逗号/句号/分号综合 |
| ༎ | U+0F0E | 双垂符 | 篇末、诗文句末 | 段落结束 |
| ༈ | U+0F0F | 四垂符 | 卷次、全书终结 | 文档结束 |

简单记忆：**tsheg 切分字，shad 切分句。**

## 二、断行硬规则（本项目实现于 `utils/tibetan-text.js`）

1. **断行只发生在 tsheg ( ་ ) 之后** —— 一个音节绝不能被拆到两行。
2. **shad ( ། )、双垂符 ( ༎ )、四垂符 ( ༈ ) 永不居行首** —— 它们附着在前一音节单元内。
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
node -e "require('./utils/tibetan-text')"   # 语法
```

分词与断行共 108 项断言（还原性 / 行首标点 / 多宽度）已在开发期通过；
修改 `tibetan-text.js` 后应重跑同样的断言（测试脚本见 git 历史 commit 记录）。

## 五、为什么重要

中文/英文排版经验直接套用藏文会出错：Canvas 若按字符硬折行，
`བཀྲ་ཤིས|་བདེ`（tsheg 前被截断）或 `|།བཟང`（shad 落行首）都是藏文排版大忌，
也直接影响藏文用户的阅读体验和产品专业度。
