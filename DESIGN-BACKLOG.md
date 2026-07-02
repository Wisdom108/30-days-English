# DESIGN-BACKLOG · UI/设计审计改进清单

> 2026-07 全面设计审计产出(8 维度并行审计 63 条 → 去重合并)。基线:tag `v1.6-cf-voice`。
> 依据:`app/DESIGN.md`(Nothing 设计系统唯一事实来源)+ UX/a11y 通用启发式。
> 好消息:Review 的"Notion 浅色残留"已清干净(全仓无 blue/green/yellow),§6 该项达标。

图例 effort:S=小(几行)· M=中(单组件重构)· L=大(涉及数据/交互模型)。

---

## 🎯 Quick Wins(高性价比,先做)

| # | 改动 | 影响 | 文件 | effort |
|---|---|---|---|---|
| Q1 | AI 火花图标去红,改单色 `text-fg-muted`(红只留给 此刻/连胜/录音/到期/危险) | 恢复"一抹红"纪律,全 AI 入口 | SpeakingBlock:144,148 · WritingBlock:117 · ai.tsx:118 | S |
| Q2 | `fg-dim(#555)` 当正文用 → 改 `fg-muted(#7d7d7d)`(WCAG AA + 可读性) | 多屏正文对比度达标 | VocabBlock:84,107,113 · BlockFooter:23 · WritingBlock:120 · SpeakingBlock:218-226 · Dashboard:142 | S |
| Q3 | SpeakButton/图标按钮触控区 <44px → 撑到 44px(移动端最常点) | 全 App 移动可点性 | shared.tsx:25 · ui/index.tsx:34,59 | S |
| Q4 | "Day" 用点阵字(Doto)违规 → 只让数字走 `.t-num` | 品牌字体纪律 | Dashboard:86 · wordmark brand.tsx:67 · ai.tsx:303 | S |
| Q5 | 连胜火苗 streak=0 仍是红 → >0 才红,否则 `text-fg-dim` | 累赘红点 | Dashboard:99 · App.tsx:115 | S |
| Q6 | Tab/评分卡/翻卡缺 focus-visible ring → 补统一焦点环 | 键盘可见性 | Segmented ui:263 · DayView:142 · Review:89,119 | S |

---

## 🔴 P0 — 系统级不一致/破损(打磨必修)

- **P0-1 圆角未收敛**:8px(rounded-lg)vs 6px(rounded-md)混用,甚至同组件内裂开(Segmented 外 lg/内 md;Select 触发 lg/项 md)。DESIGN §3 定 `--radius:6px` 却没用在该用的控件上。→ 控件/卡片统一 6px,12px 只留浮层/词卡。`ui/index.tsx` 多处 + 各 block 卡片。**M**
- **P0-2 Sheet 原语缺失**(§4 补齐清单唯一没建的),被手搓两遍(App.tsx:165 移动侧栏 + ai.tsx:288 导师底部 sheet),两套 overlay/动画各写各的。→ 封 `Sheet`(left/right/bottom)统一消费。**M**
- **P0-3 DayView 模块切换器**是手写 `role=tablist`,无键盘方向键/roving tabIndex/aria-controls;项目已装 `@radix-ui/react-tabs` 0 引用,且已有 `Segmented` 原语。→ 换 Radix Tabs 或扩展 Segmented。**M**
- **P0-4 红色外溢当 AI 品牌色**(见 Q1)。**S**
- **P0-5 核心图标控件 <44px**(见 Q3):SpeakButton 36px、IconButton md 36px/sm 32px、QAItem 看答案更小。**S~M**
- **P0-6 导入备份**键盘/AT 不可达:`<label><input class="hidden">`,`display:none` 移出 tab 序,label 不可聚焦,且手搓 Button 样式。→ 真 `<Button>` + `sr-only` input。**S**
- **P0-7 "Day" 点阵字违规**(见 Q4)。**S**

---

## 🟡 P1 — 高影响打磨

**Dashboard**
- 当前日红环在 P3 红格(Day21-30)上红叠红看不见 —— 恰好进度越深越失效。→ 白环+红角点或反色实心。**M**
- 可点 stat 和不可点 stat 视觉一模一样;不可点的连胜 stat 被渲染成 `<button disabled>`(AT 念成禁用)。→ 不可点用 `<div>`,可点加常驻 chevron。**M**
- 30 天地图 + "本月节奏"条 + stat 里的 x/30 —— 同一个"已完成"数三处重复,还用了两个不同数据源可能打架。→ 删/改节奏条。**M**

**Blocks**
- 翻卡自测只是内容瞬切,没用 §0 认证的翻卡动画(`.flip-3d` 工具类写好了但全项目 0 引用)。**M**
- 录音态无脉冲/无红/无 spinner,而"录音"是 §0 指定的红脉冲时刻(`.pulse-red` 也没人用);且录音按钮是最弱的 soft 变体。**S**
- "播放全文"同一动作在三个 block 三种按钮权重(primary / ghost-sm / ghost-sm)。**S**
- 框内容容器 block 间 padding/填充不一;WritingBlock 手搓了 RowGroup。**M**

**AI**
- 口令错了静默失败:对话框无条件关闭,无"口令错误"提示。**M**
- AI 报错是 12px 裸红字,无 `role=alert`/`aria-live`;聊天区无 `role=log`。**M**
- 聊天输入/口令输入/loader 手搓复制了 Input/Textarea/Skeleton 原语(会漂移)。**M**
- 主要 AI 触控 <44px(发送 40 / 关闭 36 / 进入 32)。**S**

**跨域 a11y/身份**
- 阅读点词是纯 `onClick` span,无 tabIndex/role/键盘 —— 阅读块主交互键盘/读屏不可达。**M**
- `fg-dim` 当正文(见 Q2,WCAG)。**S**
- iOS 启动 splash 没产出也没接(§5/§6 要求),PWA 冷启是黑屏。**M**
- Wordmark "30" 用了 Geist Mono 而非 §5 指定的 Doto。**S**
- Tab 按钮无 focus ring + 无键盘导航;焦点环透明度三套值(/25 /40 /70)不统一。**S~M**
- 两个评分按钮 hover 几乎无变化(重来 0.01 alpha 差;简单 near-black 提亮看不出)。**S**

---

## ⚪ P2 — 锦上添花(30 条摘要)

间距 2px 半步遍地(px-3.5/py-2.5 不在 4px 网格,建议要么归整要么在 §3 正式承认 2px 子网格)· Doto 用在 12-13px 小计数器(字数/翻页/分数)可读性差 · IPA 用 mono(§2 未定义该角色)· 弹层 scrim 透明度/模糊不一(无 token)· Review 内 rounded-md/lg/xl 三种半径 · 用裸 `✓` 而非 lucide Check · Progress 指标 5 格在 2 列手机布局留孤格 · maskable 图标 glyph 缩太小(pad 0.30 应 ~0.18)· 点栅格纹理只上了 2/6 个图标资产 · in-app LogoMark 用 surface 灰而非 §5 黑底 · Skeleton 原语 0 使用 · 闲置 Radix 包(tabs/popover/scroll-area/progress/slot)· spinner 是第四种动画(§0.5 只允许三种)· 翻卡 Space 键无效 · ProgressRing 600ms / Progress 条 500ms 超 400ms 上限 · 自动滚动强制 smooth 绕过 reduced-motion · 多处 hover-only chevron 触控看不到 · 听写正确答案无正反馈+输入框 w-24 会截断长词 · 翻卡自测不喂 SRS(名不符实)· 分数 chip 三种画法 · 聊天气泡 12px 圆角出格 · 欢迎卡 h2 比区块 h2 小 · Doto Day 标签在导师用 mono。

---

## 主题(横切)

1. **红纪律外溢** — AI/streak=0 处误用红,应回单色。
2. **圆角未收敛** — 系统级最大不一致(8/6/12 混,甚至同组件裂)。
3. **原语建了但被绕过** — Input/Textarea/Skeleton/Segmented 有却手搓副本会漂移;Sheet 是唯一没建的原语却手搓两遍。
4. **移动触控 <44px** — 最常用控件普遍偏小。
5. **a11y 缺口** — tab 键盘导航、焦点环、纯指针交互(点词/导入)、对比度(fg-dim)、聊天无 aria-live。
6. **动效纪律** — 认证的翻卡/脉冲工具类写好却没用;spinner 与时长超出 §0.5。
7. **字体纪律** — 大体好,但 Doto 误用于词("Day"/wordmark 30)与小计数器;mono 误用于 IPA。
8. **交互反馈** — 口令静默失败、hover 无感、听写反馈不对称。
