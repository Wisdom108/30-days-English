# SETUP · 部署与可选增强

**已上线**：`https://thirty-days-en.thinkuniverse.workers.dev`
一个 Cloudflare Worker 同时托管前端 + API，登录 cookie 同域。**AI 四功能开箱即用，零额外账号/密钥**（用 Cloudflare Workers AI 免费开源模型）。

## 已经跑起来的（无需任何 key）
- 全部课程 / 词卡 / 打卡 / 浏览器语音 / 点词查义 / 解锁全部天数（离线可用）
- **AI 对话陪练 / 写作批改 / 发音教练 / 私教答疑** —— Cloudflare Workers AI（`@cf/meta/llama-3.3-70b-instruct-fp8-fast`），免费每日额度，**无 API key、开放模式免登录**（按 IP 限日额度防滥用）

## 重新部署（改代码后）
```bash
cd app && VITE_SAME_ORIGIN=true npm run build      # 前端打包进 Worker
cd ../worker && npx wrangler deploy                 # 一条命令上线（含前端+API）
```
换更省额度的模型：改 `worker/wrangler.toml` 的 `CF_AI_MODEL`（如 `@cf/meta/llama-3.1-8b-instruct`，或 Qwen 系更适合中文）。

---

## 可选增强 1 · 真·神经语音 + 发音评测（Azure）
现在语音走浏览器 TTS。想要自然音色 + 音素级发音评测（治"人机感"），加 Azure Speech：
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
- 跨设备进度同步（现 localStorage + 导入导出；可后接 Cloudflare D1）
