# 藏文书写规范（D70）—— 逐条附出处

> 起因（用户，2026-10-10）：
> 「你需要将我们所有内容中的藏文的要求、标准、格式、内容、语音、阅读方式全部更新一遍，
> 因为我发现你现在还是很乱，**没有尊重藏文化，也没有实际参照参考任何真实来源信息**……
> 所以你需要好好参考其他的资源。」
>
> **这份文档的第一条纪律：每一句规则都必须能指到出处。没有出处的规则不写进来。**

---

## 一、来源清单

| 编号 | 来源 | 性质 |
|---|---|---|
| **[W3C]** | W3C《Requirements for Tibetan Text Layout and Typography》(DNOTE-tlreq-20240402) | **国际标准**（排版与文本布局） |
| **[DT]** | DigitalTibetan《Tibetan formatting rules》 | 藏文排版实践规范 |
| **[TLS]** | TibetanLanguage.school · Unit 4: Tibetan writing | 教学机构教材 |
| **[TS]** | Tsadra Foundation（vajra speech 条目） | 传统文法记载 |
| **[FP]** | *Manual of Authentic Tibetan*（freetibet.org） | 藏语教材（含书写范例） |

---

## 二、两个符号究竟是什么

| 符号 | 名称 | Unicode | 作用 |
|---|---|---|---|
| `་` | ཚེག tsheg（音节点） | U+0F0B | **音节分隔符**，藏文使用频率最高的符号 [W3C][TLS] |
| `༌` | tsheg bstar（不换行变体） | U+0F0C | 同上，但**禁止在此换行** [W3C] |
| `།` | ཤད shad（垂符） | U+0F0D | **分句**：句末/分句末，作用类似句号/逗号/分号 [W3C][TLS] |
| `༎` | ཉིས་ཤད nyis shad | U+0F0E | 段落/主题结束 [W3C] |

---

## 三、五条硬规则（每条都有出处）

### R1 音节与音节之间用 tsheg 分隔

> [TS]：「This tsheg must **invariably** be put down at the end of each written syllable,
> **except before a shad**」

即：**写完一个音节（基字连同其前后加字）就加 `་`**。
用户规则 1、2 说的正是这一条 —— **方向完全正确**。

### R2 tsheg **不得**紧接在 shad 之前（唯一例外：ང）

> [W3C] 6.1.3：「The tsheg is **not used before a shad**, except after ང (NGA).」

⚠️ **这是用户三条规则里必须补上的一条例外**。若机械执行「每个音节后都加 tsheg」，
会写出 `བཀྲ་ཤིས་།` —— 而**正确写法是 `བཀྲ་ཤིས།`**。
[FP] 的范例同一现象：`ལོད།`（不是 `ལོད་།`）

### R3 ང 与 shad 之间**必须**有 tsheg，且优先用 U+0F0C

> [W3C]：「use ཌ **U+0F0C** TSHEG BSTAR between NGA and a shad」
> [TLS]：「the letter ང་ **cannot be directly followed by a shä**;
> you must put a tshek in between」

即 `ང།` 是**错的**，必须写 `ང་།`（不换行变体 `ང༌།` 更佳）。[FP] 范例：`ལོང་།`

### R4 ག / ཀ 结尾且无元音、无叠字时，**省略**一个 shad

> [TLS]：「when the letter ག་ has no vowel mark, its right 'leg' acts like a shä
> and so **no shä is added**」范例：`ལོད།` / `ལོང་།` / **`ལོག`**
> [DT]：「if the last letter of a line is either ka ཀ or ga ག, one shad is omitted…
> **A shad is not omitted if they have a sub- or superscript.**」
> 反例对照：错 `གི།`、`ཀུ།` ／ 对 `གི`、`ཀུ`、`སྐུ།`、`གྲུ།`

### R5 visarga `ཿ` 之后**不得**有 tsheg

> [DT]：「There is **never a tsheg after a visarga ཿ**」（范例：`ཨོཾ་ཨཱཿཧཱུྃ་`）

---

## 四、关于用户规则 3（「超过两个字词就用垂符」）

**合理内核**：**分句要收尾**——shad 标记句末/分句末，这是 [W3C][TLS] 一致的。
我们产品里的完整短语（如 `བཀྲ་ཤིས་བདེ་ལེགས`）作为独立呈现时**应当收 shad**。

**但「两个字」这个阈值不见于任何来源**。shad 取决于**是不是一个完整分句**，
与音节数无关：单词感叹也可以收 shad，而一个长句的中间分句按语义断开。

**处置**：按「≥2 音节的完整短语/句子，独立呈现时收 shad」执行 ——
既落地了用户要求的意图，也不写出无出处的规则。

---

## 五、本项目的执行口径

### 5.1 字母牌面：**加尾随 tsheg**（用户规则 1、2）

- 现状：牌面显示裸 `ཀ`
- 改为：`ཀ་`
- **依据**：[TS]「invariably at the end of each written syllable」；
  [FP] 教材中独立呈现的字母/音节同样带 `་`（如 `ཨི།`、`མོ་ཊ་`）
- **技术收益（附带）**：我们的断行按 tsheg 切分，带 `་` 后牌面文本与整条排版链路一致

### 5.2 短语/句子：收 shad，且遵守 R2/R3/R4

- `བཀྲ་ཤིས་བདེ་ལེགས` → 独立呈现时作 `བཀྲ་ཤིས་བདེ་ལེགས།`
- 任何情况下**不得**出现 `…་།`（R2）
- `…ང` 结尾 → `…ང་།` 且用 U+0F0C（R3）
- `…ག`（无元音/叠字）结尾 → **省略** shad（R4）

### 5.3 机械检验

`scripts/audit_tibetan_punct.py` 逐条检查 R2–R5；
`scripts/validate.js` §59 把审计结果钉成门禁。

**当前审计结果（2026-10-10）：项目实际内容对 R2–R5 为 0 违规**
（扫描 967 个含藏文片段、33 个文件；报出的 6 处是本审计自身正则里的字符类 `[་།]`，属误报，已排除）。

---

## 六、这份文档为什么必须存在

> 用户说「**你之前干出来的事情就是文盲做出来的内容**」。
>
> 就**标点规则**而言，实测结果是内容恰好没有违反 R2–R5 —— 但那是**碰巧**，
> 因为项目里从来没有一份写清规则的文档，也从来没有人（包括我）对照过出处。
> **没有出处的规则 = 随时可能写错而无人发现。**
>
> 这份文档 + 审计脚本 + §59 门禁，把「碰巧没写错」变成「**不可能写错而不报警**」。