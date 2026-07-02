# 30 Days English · 30 天英语听说强化

面向**有一定基础、想系统提升听说的中文母语者**的 30 天英语强化 Web App。听说读写全覆盖、**听力与口语侧重**，基于二语习得科学方法设计，**离线优先、无需登录、纯前端**。Nothing 风格极简界面。

## ✨ 特点

- **科学方法驱动**：可理解输入 (i+1)、SM-2 间隔重复、影子跟读、高频词优先、推动性输出、睡眠巩固。
- **每日五模块 · 科学时段**：晨起精听 → 晨间词卡 → 午间口语跟读 → 傍晚阅读 → 睡前写作，顺应间隔效应与记忆巩固窗口。
- **听说侧重**：每日听 30′ + 说 40′，占比最高。
- **抗遗忘**：SM-2 间隔重复词卡（1天→3天→1周→2周→1月…），到期队列自动排程 + 每课「回顾焦点」。
- **全部内建，零付费、零后端**：
  - 🔊 朗读 (TTS)：浏览器 **Web Speech API**
  - 🎤 跟读匹配 (STT)：浏览器语音识别 + 词匹配度（反映识别听清了多少，非口音评分）
  - 📖 点词查义：优先命中当课词库（离线可用），联网时补 **Free Dictionary API** 音标与英文释义
  - 💾 进度持久化：`localStorage`（打卡、连胜、词卡、写作）+ 导入/导出备份 + 日历 (.ics) 定时提醒

## 📚 30 天课程弧线

| 阶段 | 天数 | 主题 | 强度 |
|---|---|---|---|
| 阶段一 · 生存基础 | Day 1–10 | 问候、自我介绍、数字时间、家庭、作息、饮食购物… | 白（打底/巩固） |
| 阶段二 · 日常生活 | Day 11–20 | 问路、过去时、周末、天气、健康、工作、出行、将来时、电话… | 灰（进阶） |
| 阶段三 · 流利冲刺 | Day 21–30 | 观点、比较、讲故事、邀约、描述、现在完成时、长对话、总复盘… | 红（冲刺） |

每天五模块：🎧 精听+听写 · 🔤 词汇 SRS · 🗣️ 影子跟读+跟读匹配 · 📖 分级阅读点词 · ✍️ 写作+范文自查。
共 30 天 · 714 词条（511 唯一词头）· CEFR 弧线约 A2→B1。

> 内容标准：全部词汇音标 (IPA) 与英文拼写统一为 **General American（美音/美式拼写）**，词性标签枚举化。`npm run validate`（见 `app/scripts/validate-lessons.mjs`）防内容回归。

## 🤖 AI 功能（已上线 · Cloudflare Workers AI · 免费开源）

在线体验：**https://thirty-days-en.thinkuniverse.workers.dev**

四大 AI 功能开箱即用，**零额外账号、零 API key、开放模式免登录**（Cloudflare Workers AI 免费开源模型，按 IP 限日额度）：

- **AI 对话陪练** — 就每日情景角色扮演对话，实时纠错、带话题往下走
- **AI 写作批改** — 结构化反馈（逐条纠错 + 中文说明 + 润色版 + 打分，`response_format` 结构化输出）
- **AI 发音教练** — 结合发音评分给针对性中文建议
- **AI 私教答疑** — 全局悬浮，随时问语法用法，结合当天课程作答

架构：**全 Cloudflare** —— 一个 Worker 同时托管前端 + API，用 **Workers AI 绑定**（默认 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`，可换轻量/中文模型）跑 AI，KV 按 IP 日额度。`config.ts` 优雅降级：未配置后端时回退浏览器语音、隐藏 AI。

**可选增强**（见 [`SETUP.md`](./SETUP.md)）：加 **Azure Speech** 换真·神经语音 + 音素级发音评测；加 **Cloudflare Access** 换每用户登录。都不加也完整可用。

**接入步骤与全部待填 key** 见 [`SETUP.md`](./SETUP.md)（Anthropic / Azure Speech / Supabase / Cloudflare）。后端代码在 [`worker/`](./worker)。

## 🎨 设计

Nothing 风格极简设计语言：纯黑底 + 单色灰阶 + **一抹 Nothing 红**，点阵字 (Doto) 用于数字/编号/品牌，Inter 排正文，Geist Mono 排技术微标签。点阵「30」+红点句号为品牌记号（贯穿 favicon / PWA 图标 / 应用内）。完整规范见 [`DESIGN.md`](./DESIGN.md)。组件层沿用 shadcn 变体约定（cva + `cn`），底层为 Radix 无障碍原语。

## 🛠️ 技术栈

Vite + React + TypeScript + Tailwind v4，纯静态、离线优先、可安装 PWA。课程内容 (`app/src/data/lessons.json`) 构建时打包。

## 🚀 运行

```bash
cd app
npm install
npm run dev       # 本地开发 (http://localhost:5173)
npm run build     # 产出 dist/ 静态文件
npm run preview   # 预览构建产物
node scripts/validate-lessons.mjs   # 校验课程内容
python3 scripts/gen-icons.py        # 重新生成品牌图标（需 Pillow）
python3 scripts/normalize-content.py [--apply]   # 内容规范化（IPA/拼写/词性）
```

用 Chrome / Edge 体验最佳（Web Speech API 支持最完整）。

### 📲 安装到手机（PWA）

构建/部署后用手机浏览器打开，「添加到主屏幕」即可像原生 App 一样离线使用（课程、词卡、发音、进度全离线；查过的生词也缓存）。iOS 状态栏 / 安全区已适配。

## 📁 结构

```
DESIGN.md                              # 设计系统唯一事实来源
app/
  src/
    data/curriculum.ts, lessons.json   # 30 天课程内容
    lib/  srs.ts (SM-2) · speech.ts (语音) · dictionary.ts (查词) · storage.ts (进度) · calendar.ts (.ics)
    components/  Dashboard · DayView · Review · Progress · shared · blocks/*
                 ui/  index.tsx (原语) · toast.tsx · brand.tsx (Logo)
    blocks.ts    # 每日五模块时段配置 + 阶段色
    types.ts     # 内容与进度类型
  scripts/  validate-lessons.mjs · normalize-content.py · gen-icons.py
```

## 🧠 方法论来源（研究支撑）

- 间隔重复 (Spaced Repetition) — 高效长时记忆
- 可理解输入 (Comprehensible Input, Krashen i+1) — 材料 90–98% 可懂时习得最优
- 影子跟读 (Shadowing) — 同步提升听力与口语节奏语调
- 高频词优先 — NGSL 高频覆盖日常英语约 92%
- 推动性输出 + 反馈 — 把输入转化为产出能力
