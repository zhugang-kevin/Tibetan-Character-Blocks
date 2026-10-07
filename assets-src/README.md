# assets-src/ — 真实图片「原材料」投放区（不打包、不入库）

按 `docs/asset-spec-images.md`（图片资产规格书）生成的原始大图放到这里，
再运行 `python scripts/prepare-assets.py --all` 自动加工进 `images/`。

    assets-src/
    ├── icons/      A 组：元素图标（icon_knot / icon_barley / icon_mountain / icon_yak，1024px 透明底）
    ├── reveals/    B 组：通关揭图（17→10 张，640px，文件名含 01..10 编号）
    ├── bg/         C 组：背景组（bg-global / bg-sky / bg-ground / pat-tile / grain）
    └── logo/       D 组：logo-master.png（其余尺寸自动派生）

本目录的图片**不会**进小程序包（packOptions 已忽略），也不进 Git（见 .gitignore）。
