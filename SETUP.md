# SETUP · AI + 语音 + 登录 接入清单

这份清单列出**你需要补充的全部占位符**（账号/密钥）。全部留空时，App 仍作为**纯前端离线 PWA** 正常运行（浏览器语音、无 AI、无登录）；逐项填好后，对应的高级功能自动点亮。

> 架构：前端（Vite/React，`app/`）+ Cloudflare Worker 后端（`worker/`）。密钥只放后端 / 环境变量，前端只拿到公开的 anon key 和短时语音 token。

---

## 需要你准备的账号（4 个）

| 服务 | 用途 | 拿什么 |
|---|---|---|
| **Anthropic** | AI 功能（对话/批改/教练/答疑，走 Claude 额度） | API Key `sk-ant-...` |
| **Azure Speech** | 自然神经语音 TTS + 发音评测（治"人机感"） | Speech 资源 Key + Region（如 `eastus`） |
| **Supabase** | 登录（magic-link + Google）+ 额度/进度 | Project URL + anon key（+ 可选 JWT Secret） |
| **Cloudflare** | 部署 Worker 后端 | 账号即可（`wrangler login`） |

---

## 步骤

### 1) Supabase（登录）
1. 新建 project → **Project Settings › API**：复制 **Project URL** 与 **anon public key**。
2. **Authentication › Providers**：开启 **Email**（magic-link）；如需 Google，开启 **Google** 并填 OAuth Client（Google Cloud Console 拿 Client ID/Secret）。
3. **Authentication › URL Configuration**：把你的前端地址（本地 `http://localhost:5173`、线上 `https://<你的域名>`）加入 **Redirect URLs**。
4. （可选，旧版方案）**Project Settings › API › JWT Secret** → 作为 Worker 的 `SUPABASE_JWT_SECRET`。新项目用非对称签名密钥时**留空**，Worker 会自动走 JWKS 校验。

### 2) Azure Speech（语音）
1. Azure Portal → 创建 **Speech service** 资源，记下 **Key** 和 **Region**。
2. Key 作为 Worker secret `AZURE_SPEECH_KEY`；Region 填 `worker/wrangler.toml` 的 `AZURE_SPEECH_REGION`。
3. 想换音色：改 `wrangler.toml` 的 `AZURE_VOICE`（默认 `en-US-AvaMultilingualNeural`，也可 `en-US-JennyNeural` 等）。

### 3) Anthropic（AI）
1. console.anthropic.com → 拿 **API Key**，作为 Worker secret `ANTHROPIC_API_KEY`。
2. 默认模型 `claude-opus-4-8`（质量最好）。想省成本/更快：改 `wrangler.toml` 的 `ANTHROPIC_MODEL` 为 `claude-sonnet-5` 或 `claude-haiku-4-5`。

### 4) 部署 Worker（后端）
```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create QUOTA          # 把输出的 id 填回 wrangler.toml 的 [[kv_namespaces]]
# 填 wrangler.toml 的 [vars]：SUPABASE_URL、AZURE_SPEECH_REGION（AZURE_VOICE/模型/额度可选）
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put AZURE_SPEECH_KEY
npx wrangler secret put SUPABASE_JWT_SECRET     # 若用非对称签名密钥，可跳过
npx wrangler deploy                             # 记下 https://thirty-days-en.<子域>.workers.dev
```
本地联调：把上面 secret 写进 `worker/.dev.vars`（见 `.dev.vars.example`），`npx wrangler dev`。

### 5) 前端环境变量
在 `app/.env.local`（见 `app/.env.example`）填：
```
VITE_WORKER_URL=https://thirty-days-en.<子域>.workers.dev
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
# VITE_AZURE_VOICE=en-US-AvaMultilingualNeural   # 可选
```
然后 `cd app && npm run build`（或 `npm run dev`）。CORS：上线后把 `worker/wrangler.toml` 的 `ALLOWED_ORIGIN` 改成你的前端域名。

---

## 功能点亮条件（优雅降级）

| 功能 | 需要 |
|---|---|
| 课程 / 词卡 / 打卡 / 浏览器语音 / 点词查义 | **无需任何配置**（离线可用） |
| 自然神经语音 TTS + 发音评测 | Worker + Azure + 登录 |
| AI 对话陪练 / 写作批改 / 发音教练 / 私教答疑 | Worker + Anthropic + Supabase 登录 |

没配置时：AI 区块显示"需配置后端"占位提示，私教悬浮按钮与登录入口隐藏，语音自动回退浏览器 TTS。

---

## 仍是占位符 / 待你补充的"物料"

- **各家 API Key / 账号**（上面 4 项）——代码已就位，填 key 即用。
- **真人录音音频**：当前听力/跟读用 Azure TTS 合成；若你有真人录音，可后续接入（`lib/speech.ts` 的 `speak` 已抽象，可加音频源 provider）。
- **品牌插画 / 首屏图**：当前用点阵「30」记号；如需插画位另议。
- **课程内容**：30 天已齐（714 词，General American 校对）；如需扩充/本地化再补 `app/src/data/lessons.json`（有 `scripts/validate-lessons.mjs` 防回归）。
