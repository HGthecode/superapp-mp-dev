# 灵感库（仅供方向探索）

> **使用边界**：本目录服务于设计流程的**阶段一·定方向**——确定风格气质与品牌主色意向。
> 其中出现的任何具体取值（十六进制色值、字号、圆角 12–16px、间距 xs–xl、CSS 变量等）都是数据样本或 Web 示例，**禁止直接带入设计稿**；出稿取值一律以 [../system.md](../system.md) 档位为准。

## 文档

| 文件 | 内容 |
| --- | --- |
| `design-styles.md` | 设计风格百科：赛博朋克、诧寂、包豪斯、Y2K、国潮等风格的色彩/字体/氛围/适用场景 |
| `design-psychology.md` | 色彩情绪、版式心理（F 型阅读、视觉重心）、字体性格、营销心理模型 |
| `chinese-aesthetics.md` | 中式美学：五行色彩、节气美学、传统纹饰 |
| `design-principles.md` | 设计基础理论：平面/色彩/立体构成、版式与字体原则 |

## 数据库（`ui-ux-data/`，CSV 格式）

| 文件 | 内容 |
| --- | --- |
| `styles.csv` | 67 种 UI 风格：关键词、配色特征、适用/禁用场景、明暗模式与无障碍评级 |
| `colors.csv` | 97 套按产品类型的配色方案（主色/辅助/CTA/背景/文本/边框 + 取色理由） |
| `typography.csv` | 字体搭配库：标题/正文字体组合、气质关键词、适用场景 |
| `ux-guidelines.csv` | UX 规则条目：按类别/平台的 Do & Don't 与严重级别 |
| `ui-reasoning.csv` | UI 推理规则：按界面类别推荐模式、风格优先级、决策规则与反模式 |
| `charts.csv` | 图表类型选型参考 |
| `icons.csv` / `landing.csv` / `products.csv` / `web-interface.csv` / `react-performance.csv` | 图标选型、落地页模式、产品类型、Web 界面与性能参考 |
| `stacks/*.csv` | 各技术栈（react/vue/flutter/swiftui 等）的实现约定，仅供还原实现阶段参考 |

## 检索脚本（`scripts/`）

在本目录下运行：

```bash
# 关键词检索各域数据（--domain 可选 style/color/typography/ux 等）
python3 scripts/search.py "企业巡检 App" --domain style --max-results 3

# 聚合生成一份方向建议（风格 + 配色 + 字体气质，ASCII 或 Markdown）
python3 scripts/design_system.py "SaaS dashboard" --project-name "示例" --format markdown
```

脚本输出为**方向建议**：用它确定风格关键词和品牌主色意向，再进入阶段二按 system.md 档位出稿。

## 来源

基于开源项目 [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 精简（移除了实现向板块，保留风格/心理/数据资产）。
