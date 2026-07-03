# SETUP · 部署与可选增强

**已上线**：`https://thirty-days-en.thinkuniverse.workers.dev`
一个 Cloudflare Worker 同时托管前端 + API，登录 cookie 同域。**AI 四功能开箱即用，零额外账号/密钥**（用 Cloudflare Workers AI 免费开源模型）。

## 已经跑起来的（无需任何 key）
- 全部课程 / 词卡 / 打卡 / 点词查义 / 解锁全部天数（离线可用）
- **AI 对话陪练 / 写作批改 / 发音教练 / 私教答疑** —— Cloudflare Workers AI（`@cf/meta/llama-3.3-70b-instruct-fp8-fast`），免费每日额度，**无 API key**
- **神经语音（Aura-2）+ 跟读识别（Whisper）** —— Cloudflare Workers AI，免费、无 key。朗读自然音色、跟读录音转写算匹配度。`CF_TTS_MODEL` / `CF_STT_MODEL` 可换模型。
- 登录：默认「访问口令」门（已设，见下）；也可切开放模式或 Cloudflare Access

## 重新部署（改代码后）
```bash
cd app && VITE_SAME_ORIGIN=true npm run build      # 前端打包进 Worker
cd ../worker && npx wrangler deploy                 # 一条命令上线（含前端+API）
```
换更省额度的模型：改 `worker/wrangler.toml` 的 `CF_AI_MODEL`（如 `@cf/meta/llama-3.1-8b-instruct`，或 Qwen 系更适合中文）。

---

## 可选增强 1 · 音素级发音评测（Azure）
语音**已是 Cloudflare 原生**：朗读用 Aura-2 神经音、跟读识别用 Whisper（都免费、无 key、已上线）。
只有一项 CF 给不了：**逐音素发音打分**（哪个音不准 + 分数）。想要它再加 Azure Speech：
```bash
cd worker
# wrangler.toml [vars] 填 AZURE_SPEECH_REGION（如 eastus）
npx wrangler secret put AZURE_SPEECH_KEY            # 终端粘 key，不进 git/聊天
npx wrangler deploy
```
（Azure Portal → 建 Speech 资源 → 拿 Key + Region，有免费档 F0。）不加则继续用浏览器语音，一切照常。

## 登录 · 两种方式（二选一，都免 Anthropic/Azure）

**A. 访问口令（推荐 · 零后台，全程 wrangler）** — 已启用。
```bash
cd worker
echo "你的口令" | npx wrangler secret put APP_PASSCODE   # 改口令
npx wrangler deploy                                      # 无需，secret 即时生效
# 想彻底关掉登录(回开放模式)：npx wrangler secret delete APP_PASSCODE
```
设了 `APP_PASSCODE` → 前端弹口令框，输对才可用 AI（口令存本地，之后免输）。共享一个口令，适合个人/小圈子。

**B. 每用户登录（Cloudflare Access）** — 需 Zero Trust 后台，支持邮箱/Google 独立账号 + 每用户额度：
1. Cloudflare Zero Trust → Access → Applications → Add self-hosted，domain 填 Worker 域名，path 加 `ai`/`speech`/`me`/`login` 四行（base 保持公开）。
2. Policy=Allow（限你的邮箱或 Everyone）；Settings→Authentication 开 One-time PIN / Google。
3. 复制 **AUD tag** + team 域名 → 填 `worker/wrangler.toml` 的 `CF_ACCESS_AUD` / `CF_ACCESS_TEAM_DOMAIN` → `npx wrangler deploy`。
配好后前端自动改成"需登录"，未登录点 AI 会走 Access 登录页。

---

## 本地开发
```bash
# 前端热更新
cd app && npm run dev                                # http://localhost:5173
# 后端本地（含 Workers AI；.dev.vars 放 DEV_BYPASS_AUTH=true 免登录）
cd worker && npx wrangler dev
```

## 敏感度
- 🔴 Azure key（若用）：只经 `wrangler secret put`，不进 git/聊天。
- 🟢 其余（模型名、region、AUD、team 域名、KV id）：非敏感，在 wrangler.toml。
- Cloudflare 登录：`wrangler login` 浏览器授权，凭证只在本机。

## 仍可后补（非必需）
- 真人录音音频（现 Workers AI / 浏览器合成；`lib/speech.ts` 已抽象可加音频源）
- 品牌插画（现点阵「30」记号）
- 跨设备进度同步（现 localStorage + 导入导出；后端已备好，见下方「会员系统」）

---

## 会员系统（可选 · Cloudflare D1）
用户名+密码账号 + 激活码会员 + 云端进度同步 + 分级额度（会员全额 80/200，免费体验 `FREE_AI_QUOTA=5` / `FREE_SPEECH_QUOTA=20`）。**默认关闭**：不启用则一切照旧，`/auth/*` 与 `/progress` 返回 503。

启用 5 步（全程 wrangler，无后台）：
```bash
cd worker
npx wrangler d1 create thirty-days-en-db            # 1. 建库，复制打印的 database_id
# 2. wrangler.toml 取消 [[d1_databases]] 块注释，粘入 database_id
npx wrangler d1 migrations apply thirty-days-en-db --remote   # 3. 建表
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET # 4. 会话签名密钥
npx wrangler deploy                                 # 5. 上线
```

生成激活码（EN30-XXXX-XXXX，参数 = 数量 天数）：
```bash
node scripts/gen-codes.mjs 10 365 > codes.sql
npx wrangler d1 execute thirty-days-en-db --remote --file=codes.sql
```

接口：`POST /auth/register|login|logout|activate`、`GET/PUT /progress`；`/me` 变 `mode:"account"`（返回 `member`/`memberUntil`）。原口令 `APP_PASSCODE` 仍有效（视为会员）。会话是 HMAC 签名 cookie（180 天）；密码 PBKDF2 加盐存 D1，不可逆。
