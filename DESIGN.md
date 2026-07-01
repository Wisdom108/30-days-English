# 30 Days English — 设计系统 · DESIGN.md

> Nothing-inspired 极简设计语言。单色 + 一抹红，点阵美学，精密网格，功能至上。
> 本文件是设计的**唯一事实来源**。所有组件、颜色、字体、间距必须引用这里的 token，禁止散落的 magic value。

---

## 0. 设计原则（Nothing 语言内核）

1. **单色为骨，红为魂** — 界面 95% 由黑/白/灰构成，Nothing 红 `#D6001C` 只用于「此刻/连胜/录音/到期/危险」等极少数需要注意力的地方。红一旦泛滥就失去意义。
2. **点阵为记** — 点阵字 (Doto) 与点栅格背景是品牌指纹，用于数字、Day 编号、Logo、大标题数值。绝不用点阵字排正文。
3. **精密网格 + 留白** — 一切对齐到 4px 网格。宁可留白，不塞满。发丝级边框 (`1px`) 代替重阴影。
4. **技术感微标签** — 分区标题、徽章用等宽大写 + 加宽字距 (`.label-nd`)，像仪表盘/终端。
5. **克制的动效** — 只做「进入」「翻卡」「脉冲」三类，`cubic-bezier(.22,1,.36,1)`，≤400ms，尊重 `prefers-reduced-motion`。
6. **暗色优先** — 纯黑 `#000` 底，OLED 友好，符合 Nothing 硬件调性。

---

## 1. 颜色 Token（`@theme` in index.css）

| 语义 | Token | 值 | 用途 |
|---|---|---|---|
| 背景 | `--color-bg` | `#000000` | 页面底 |
| 面 | `--color-surface` | `#0b0b0b` | 卡片 |
| 面-2 | `--color-surface-2` | `#121212` | 侧栏/内嵌槽 |
| 抬升 | `--color-elevated` | `#171717` | 选中态/浮层 |
| 悬停 | `--color-hover` | `#1c1c1c` | hover 底 |
| 边框 | `--color-border` | `#262626` | 默认发丝边 |
| 弱边框 | `--color-border-soft` | `#191919` | 行分隔 |
| 强边框 | `--color-border-strong` | `#383838` | 强调/勾选框 |
| 前景 | `--color-fg` | `#ffffff` | 主文字 |
| 次前景 | `--color-fg-secondary` | `#b4b4b4` | 次要文字 |
| 弱前景 | `--color-fg-muted` | `#7d7d7d` | 辅助/标签 |
| 极弱 | `--color-fg-dim` | `#555555` | 占位/禁用 |
| 品牌 | `--color-brand` | `#ffffff` | 主按钮底=白 |
| 品牌前景 | `--color-brand-fg` | `#000000` | 白按钮上的字 |
| **红** | `--color-red` | `#d6001c` | 唯一强调色 |
| 红-soft | `--color-red-soft` | `rgba(214,0,28,.14)` | 红底提示 |

**阶段色**（贯穿地图/进度）：P1 生存基础=白 `#fff`，P2 日常生活=灰 `#8a8a8a`，P3 流利冲刺=红 `#d6001c`。构成一条「白→灰→红」的强度渐强弧线，语义即难度递增。

**语义状态**统一到单色+红：成功=白、警告=灰、危险=红。**禁止**引入蓝/绿/黄等第三色（Review 评分块的浅色 Notion 残留必须清除）。

---

## 2. 字体系统（三族，严格分工）

| 角色 | 字族 | Token | 用在哪 | 禁用在哪 |
|---|---|---|---|---|
| **点阵展示** | Doto | `--font-display` | 数字：Day 编号、连胜、统计大数、Logo「30」、大标题里的数值 | ❌ 正文、句子、需要阅读的英文 |
| **技术微标签** | Geist Mono | `--font-mono` | `.label-nd`、徽章、键位提示、代码化标签（大写+字距） | ❌ 长句 |
| **正文/UI/阅读** | Inter Variable | `--font-sans` | 所有中英文正文、按钮、标题、学习材料（单词/句子/范文） | ❌ 大数字展示 |

中文回退：`'PingFang SC','Microsoft YaHei', system-ui`。
**关键统一动作**：全项目大数字/编号统一走 `.font-display`（Doto）；分区标签统一走 `.label-nd`；杜绝任意 `font-mono` 混用在句子上。英文学习正文（听力原文、对话、阅读、范文、词卡例句）一律 Inter，保证可读性。

字号阶梯（4px 网格）：`11 · 12 · 13 · 14 · 15 · 16 · 17 · 20 · 24 · 26 · 34 · 44`。行高：正文 `1.6`，阅读材料 `2.0`，展示数字 `1.0`。

---

## 3. 形状 · 间距 · 高度

- **圆角**：`--radius: 6px`（控件/卡片主圆角）；大浮层/词卡 `10–12px`；徽章 `4px`；胶囊 `999px`。统一收敛，避免 `rounded-xl/lg/md` 混用。
- **边框**：默认 `1px var(--color-border)`；行分隔用 `border-soft`；强调用 `border-strong`。
- **阴影**：几乎不用投影，改用 `--shadow-rest / -card`（≈1px inset ring）。仅浮层用 `--shadow-popover`。
- **间距**：段落块间距统一 `space-y-*`（页面级 `7`，区内 `3–4`）。控件内边距走 4px 网格。
- **触控**：移动端可点目标 ≥ 44px（图标按钮 `h-11 w-11`）。

---

## 4. 组件系统（shadcn 约定 · Radix/Base-UI 血统的无障碍原语）

沿用 **shadcn 模式**：`cva` 变体 API + `cn()` 合并 + 语义 token；底层用已装的 Radix 原语（Base UI 与 Radix 同源，均由 Radix/WorkOS 团队维护，无障碍与受控 API 一致）。**不新增第三方 UI 库**，避免风格分裂；已装但闲置的 `@radix-ui/react-select`/`tabs`/`popover`/`scroll-area` 要用起来替换裸 `<select>`、手写 tab。

**原语清单**（`components/ui/`）：
- 已有：`Button`(primary/secondary/ghost/soft/danger × sm/md/lg/icon)、`Card`/`CardBody`、`Badge`(default/accent/success/warning/red)、`Progress`、`Callout`(accent/warning/red)、`Tooltip`、`ConfirmDialog`、`SectionLabel`。
- **补齐**：`Input`、`Textarea`、`Select`(Radix)、`Segmented`(tab 切换统一原语)、`Sheet`(移动侧栏抽离)、`Separator`、`Kbd`(键位提示)、`EmptyState`(空态统一)、`Skeleton`(加载态)、`IconButton`。
- 统一：所有输入态焦点环 `focus-visible:ring-2 ring-brand/25`；所有 hover 用 `--color-hover`；所有行式列表用 `RowGroup` + `border-soft` 分隔。

---

## 5. 视觉识别（Visual Identity）— 待建

现状：图标仅「黑底红点」，无 wordmark、无「30」字标、favicon 是内联 SVG 红圆 —— **无识别度**。

**新标识方案**：
- **Logo 记号**：点阵「**30**」(Doto 白) + 右下角一枚红点句点，置于黑底微点栅格。既是编号又是品牌，Nothing 味十足。
- **Wordmark**：`30` (Doto) `DAYS` (Geist Mono 大写字距) — 双字族并置，展示 vs 技术。
- **产出资产**：`favicon.svg`（点阵 30）、`pwa-192 / 512 / maskable-512`、`apple-touch-icon`、首屏 splash。全部黑底、白点阵 30、红点。
- 侧栏/头部的品牌区统一用该记号（当前是孤零零红点 + "30 DAYS" 文字，需换成新记号并统一桌面/移动）。

---

## 6. 交付前检查清单（Definition of Done）

- [ ] 全项目零 magic color：仅用 §1 token；Review 浅色残留清除
- [ ] 字体分工严格执行（§2），无越界使用
- [ ] 圆角/边框/间距收敛到 §3 阶梯
- [ ] 裸 `<select>` / 手写 tab → Radix 原语；补齐缺失原语
- [ ] 视觉识别资产全套产出并接入 index.html / manifest
- [ ] 移动端 44px 触控 + 安全区 + PWA 可安装
- [ ] `prefers-reduced-motion` 全覆盖
- [ ] `tsc -b` 0 错、`vite build` 0 警告
- [ ] 内容：IPA / 翻译 / 词性 / 英文自然度全部校对（见 Phase 5）
