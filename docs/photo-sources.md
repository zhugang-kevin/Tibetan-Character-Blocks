# 实景照 sourcing kit（Wikimedia Commons · CC 授权）

> 用途：藏字方块小程序的 4 张实景照（`images/scene/home.jpg · game.jpg · bodhi.jpg · monastery.jpg`）
> 当前由 `data/photo-assets.js` 引用，4 个槽位均已启用。
> 目标：用 **Wikimedia Commons 上 CC-BY / CC-BY-SA** 的真实照片替换现有占位图，
> **逐张由用户本人核对授权与出处后**才视为可用（AI 不替用户签确，防止假绿）。

## 1. 许可证政策（硬性）

| 类别 | 是否可用 | 理由 |
|---|---|---|
| CC-BY 2.0 / 2.5 / 3.0 / 4.0 | ✅ 可用 | 商业可用，只需署名 |
| CC-BY-SA 2.0 / 2.5 / 3.0 / 4.0 | ✅ 可用 | 商业可用 + 署名 + 相同方式共享 |
| CC0 1.0 | ✅ 可用 | 公共领域，无需署名（仍建议注明出处） |
| **CC-BY-NC / -NC-SA / -NC-ND** | ❌ 禁用 | 小程序含米大师虚拟支付，属**商业使用**，NC（非商业）不可用于商业产品 |
| **CC-BY-ND / -NC-ND** | ❌ 禁用 | `prepare-assets.py --scene` 会对照片**降饱和 / 压暗 / 裁剪**，构成演绎；ND（禁止演绎）不可用 |
| All Rights Reserved | ❌ 禁用 | 未授权 |

**必须逐张记录的字段**（见 `docs/photo-attribution.json`）：作者、作品名、许可证全称+版本、许可证链接、Wikimedia 文件页 URL、取用日期。

## 2. 各槽位搜索词（复制到 commons.wikimedia.org 搜索框）

- **home** → `Tibetan home interior` / `Tibetan house interior` / `Tibetan village home`
- **game**（游戏内背景，取宁静藏地风光）→ `Tibet landscape` / `Tibetan plateau` / `Himalaya Tibet scenery`
- **bodhi** → `Bodhi tree` / `Bodhi tree Bodhgaya` / `sacred fig tree`
- **monastery** → `Tibetan monastery` / `Tibetan gompa` / `Potala` / `Labrang Monastery`

> 可直接用 Commons 的「筛选 → 许可证」按 CC-BY / CC-BY-SA 过滤。
> 链接格式示例：`https://commons.wikimedia.org/w/index.php?search=Tibetan+monastery&title=Special:MediaSearch&type=image`

## 3. 取用流程（用户侧）

1. 在 Wikimedia Commons 按上表搜索，筛 CC-BY / CC-BY-SA。
2. 打开**文件页**，确认许可证与作者（看 Author / Licensing 段）。
3. 下载合适分辨率的原图（建议 ≥1280px 长边，便于裁剪与降饱和）。
4. 放入 `images/scene/`，**文件名保持** `home.jpg` / `game.jpg` / `bodhi.jpg` / `monastery.jpg`（覆盖现有占位，路径无需改）。
5. 在 `docs/photo-attribution.json` 填 `sourceUrl / author / license / licenseUrl`，并把 `verified` 改为 `true` —— **仅在你本人核对后**。
6. （可选）如需统一色罩：`python scripts/prepare-assets.py --scene`。
7. `node scripts/validate.js` 确认 **0 错误**。

## 4. 反假绿约定

- `docs/photo-attribution.json` 里任何一条 `verified: false` 都表示「尚未经用户本人核对」，
  不得宣称该照片已授权可用。
- 若某槽位暂时只有占位图、无已核对 CC 照片，应在 `photo-assets.js` 将该键置空字符串
  （`''` = 不启用照片层，保持渐变底，零回归），**不要**用未核对的图假装已授权。

## 5. 进度台账

| 槽位 | 文件 | 已下载 | 用户已核对授权 | 备注 |
|---|---|---|---|---|
| home | images/scene/home.jpg | ⬜ | ⬜ | |
| game | images/scene/game.jpg | ⬜ | ⬜ | 游戏内背景，取宁静风光 |
| bodhi | images/scene/bodhi.jpg | ⬜ | ⬜ | |
| monastery | images/scene/monastery.jpg | ⬜ | ⬜ | |
