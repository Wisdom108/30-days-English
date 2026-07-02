# SETUP · AI + 语音 + 登录 接入清单

全部占位符留空时，App 仍作为**纯前端离线 PWA** 正常运行（浏览器语音、无 AI、无登录）；逐项填好后对应高级功能自动点亮。**全 Cloudflare 生态 + 2 个 key**，无 Supabase。

> 架构：前端（Vite/React，`app/`，可部署到 Cloudflare Pages）+ Cloudflare Worker 后端（`worker/`）。登录用 **Cloudflare Access（Zero Trust，免费 ≤50 用户）**，Worker 校验 Access 签发的 JWT。敏感 key 只在 Worker，前端只用 cookie 会话。

---

## 需要的账号（3 个）

| 账号 | 用途 | 拿什么 | 敏感度 |
|---|---|---|---|
| **Cloudflare** | 部署 Worker + KV 额度 + **Access 登录**（全免费档） | 账号（`wrangler login` 浏览器授权，你自己跑） | — |
| **Anthropic** | AI 四功能（走 Claude 额度） | API key `sk-ant-…` | 🔴 密钥 |
| **Azure Speech** | 自然神经语音 + 发音评测 | Key + Region(如 eastus) | 🔴 Key / 🟢 Region |

---

## 步骤

### 1) 部署 Worker
```bash
cd worker
npm install
npx wrangler login                              # 浏览器授权（你自己）
npx wrangler kv namespace create QUOTA          # 把输出的 id 填进 wrangler.toml 的 [[kv_namespaces]]
# 填 wrangler.toml [vars]：AZURE_SPEECH_REGION（AZURE_VOICE/模型/额度可选）
npx wrangler secret put ANTHROPIC_API_KEY       # 终端粘密钥，不进文件/git
npx wrangler secret put AZURE_SPEECH_KEY
npx wrangler deploy                             # 记下 https://thirty-days-en.<子域>.workers.dev
```
本地联调：`worker/.dev.vars` 里放 `DEV_BYPASS_AUTH=true` + 两个 key（见 `.dev.vars.example`），`npx wrangler dev`（跳过 Access 登录直接测）。

### 2) Cloudflare Access（登录，Zero Trust 免费档）
1. Cloudflare 仪表盘 → **Zero Trust** → 首次会让你起个 team 名 → 得到 team 域名 `你的team.cloudflareaccess.com`。
2. **Access › Applications › Add an application › Self-hosted**：
   - Application domain 填你的 **Worker 域名**（`thirty-days-en.<子域>.workers.dev`），Path 可留空（保护整个 Worker）或按需只保护 `/ai`、`/speech`、`/me`。
   - 建 **Policy**：Action=Allow，规则按需（如 Emails ending in 你的域名 / 指定邮箱 / Everyone）。
   - **登录方式**：Zero Trust › Settings › Authentication 里开 **One-time PIN（邮箱验证码，默认就有）**，要 Google/GitHub 就加对应 Login method。
3. 建好后在该 Application 的 **Overview** 复制 **Application Audience (AUD) Tag**。
4. 回填 `worker/wrangler.toml [vars]`：`CF_ACCESS_TEAM_DOMAIN = "你的team.cloudflareaccess.com"`、`CF_ACCESS_AUD = "<AUD tag>"`，然后 `npx wrangler deploy`。

> 跨域 cookie：Worker 与前端不同域时，登录 cookie 需能带上。最稳的是**同域部署**——把前端放 Cloudflare Pages，Worker 挂在同域 `/api/*` 路由（前端 env 用 `VITE_WORKER_URL=/api`）。不同子域也能用，但确保 Access 应用覆盖到位。

### 3) 前端环境变量
`app/.env.local`（见 `app/.env.example`）：
```
VITE_WORKER_URL=https://thirty-days-en.<子域>.workers.dev   # 或同域时用 /api
# VITE_AZURE_VOICE=en-US-AvaMultilingualNeural              # 可选
```
然后 `cd app && npm run build`。上线后把 `worker/wrangler.toml` 的 `ALLOWED_ORIGIN` 改成你的前端域名（用 cookie 后不能是 `*`）。

---

## 功能点亮条件（优雅降级）

| 功能 | 需要 |
|---|---|
| 课程 / 词卡 / 打卡 / 浏览器语音 / 点词查义 / 解锁全部天数 | **无需任何配置**（离线可用） |
| 自然神经语音 + 发音评测 | Worker + Azure + Access 登录 |
| AI 对话陪练 / 写作批改 / 发音教练 / 私教答疑 | Worker + Anthropic + Access 登录 |

没配置时：AI 区块显示"需配置后端"占位，私教悬浮/登录入口隐藏，语音回退浏览器 TTS。

---

## 敏感度分工（重要）
- 🔴 **Anthropic key / Azure key**：只经 `wrangler secret put`（终端输入）→ 存 Cloudflare secret store，绝不进文件/git/聊天。
- 🟢 **Region / Worker URL / AUD tag / team 域名**：非敏感，写进 `wrangler.toml` / `.env.local`。
- **Cloudflare 登录**：`wrangler login` 浏览器授权，凭证只在你本机。

## 仍是占位符 / 可后补
- 真人录音音频（现用 Azure TTS 合成；`lib/speech.ts` 已抽象，可加音频源 provider）
- 品牌插画（现用点阵「30」记号）
- 进度云同步（现为 localStorage + 导入导出备份；如需跨设备可后接 Cloudflare D1）
