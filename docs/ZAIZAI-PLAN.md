# v3.0 「语自在 · 在在」信使化改造 — 实施契约

> 本文档是所有实现 agent 的共同契约。改动必须遵守此处的接口与文件归属;
> 发现契约与现实冲突时,以最小改动保住契约语义,并在 commit message 里注明。

## 0. 产品决策(已锁定)

- 概念:消息流为主界面,AI 教练「在在 Zaizai」驱动;产品 lockup「语自在 · 30 Days English」
- 美学:iOS 26/27 Liquid Glass(tinted 档、可读性优先),iMessage 气泡 + 原生通话规格,浅色为主(暗色下轮)
- 成长:徽章 + 额度经济(学习赚通话秒数);徽章/解锁只能靠学,会员=免赚额度
- 场景:随时生成场景包,文字演练免费,实战电话走 Grok(花额度);v3.0 场景不直接补完课程 block,
  只赚额度+徽章+写进记忆(避免污染课程完成语义)
- 30 天课表是量化主干:进度卡常驻消息流顶部;课程页保留一等 tab

## 1. 信息架构

Tabs(App.tsx NAV 重排):
- `/` 在在(ChatHome,新默认页,MessageCircle icon)
- `/course` 课程(原 Dashboard 组件原样迁路由;today sentinel 逻辑保留,指向 /day/:day)
- `/review` 复习(不动)
- `/me` 我的(新页:钱包+徽章+账号入口+数据/设置链接到 /progress)

保留路由:`/day/:day`(不动)、`/progress`(从 /me 链接进入,退出 NAV)、`/ai` → `<Navigate to="/" replace>`。
TutorFab 移除挂载(在在替代其职能);CloudSync 保留。

## 2. D1 迁移 `worker/migrations/0003_economy.sql`

```sql
CREATE TABLE IF NOT EXISTS wallet (
  user_id INTEGER PRIMARY KEY,
  balance_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta_seconds INTEGER NOT NULL,        -- 正=赚 负=花
  reason TEXT NOT NULL,                  -- earn:<event> | spend:grok_call
  ref TEXT,                              -- 事件去重键,如 'block:12:listening'
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_user_ref ON wallet_ledger(user_id, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_user_time ON wallet_ledger(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS badges (
  user_id INTEGER NOT NULL,
  badge_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                    -- plan|weakness|highlight|quirk|pref
  text TEXT NOT NULL,                    -- ≤200 chars,中文
  weight INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, weight DESC, updated_at DESC);
```

去重靠 `ref` 唯一索引(INSERT OR IGNORE→changes=0 即已领过),天然幂等,无需 KV。

## 3. Worker 契约(新文件 `wallet.ts`、`zaizai.ts`;改 `grok.ts`、`index.ts`)

### 3.1 经济常量(wallet.ts 导出,单一来源)

```ts
export const EARN_RULES = {
  block_complete:    { seconds: 120, dailyCap: 5,  refFmt: 'block:{day}:{key}' },
  day_complete:      { seconds: 300, dailyCap: 1,  refFmt: 'day:{day}' },
  scenario_complete: { seconds: 120, dailyCap: 3,  refFmt: 'scenario:{date}:{n}' },
  streak_milestone:  { seconds: 600, dailyCap: 1,  refFmt: 'streak:{n}' }, // n∈{7,14,21,30}
} as const
export const GROK_CALL_COST = 300           // 每通电话扣 300 秒
export const BADGES: { id: string; name_zh: string; desc_zh: string; unlock?: string }[] = [
  { id: 'first_call',  name_zh: '初通电话', desc_zh: '完成第一通实时通话' },
  { id: 'streak_7',    name_zh: '七日不断', desc_zh: '连续学习 7 天', unlock: 'voice:rex' },
  { id: 'scenario_3',  name_zh: '场景新手', desc_zh: '完成 3 次场景演练', unlock: 'voice:leo' },
  { id: 'scenario_10', name_zh: '场景老手', desc_zh: '完成 10 次场景演练' },
  { id: 'day_10',      name_zh: '生存毕业', desc_zh: '完成 Day 1–10' },
  { id: 'day_20',      name_zh: '生活自如', desc_zh: '完成 Day 11–20' },
  { id: 'day_30',      name_zh: '出师',     desc_zh: '完成全部 30 天' },
]
```

### 3.2 端点

- `GET /wallet`(D1 session 必须,`readSession`+uid `u:`,否则 401)
  → `{ balanceSeconds, badges: string[], ledger: {delta,reason,at}[≤20], rules: {…EARN_RULES 摘要}, callCost }`
- `POST /earn` body `{ event: keyof EARN_RULES, ref: string, day: 'YYYY-MM-DD' }`(day=客户端本地日期,
  必填,服务端校验格式且 ±36h;日上限按 (user_id, reason, day) 计;scenario ref 的 n 由服务端重建)
  → 校验 event 合法、ref 与 refFmt 形状匹配、当日该 event 已领次数 < dailyCap(查 ledger 当日 count)
  → `INSERT OR IGNORE` ledger(唯一 ref)+ 更新 wallet 余额(单条 SQL 累加)
  → 徽章判定(first_call 由 grok 消费侧发;scenario_N 数 ledger 里 scenario earn 总数;day_N/streak_N 信 meta 但 cap 校验)
  → `{ balanceSeconds, earned: seconds|0, newBadges: string[] }`(已领过 → earned:0,非错误)
- `POST /ai/zaizai`(挂进 handleAI,享受既有 identify+`q` quota+bump)
  body `{ messages: Msg[], lesson?: LessonCtx, mode?: 'chat'|'brief', stats?: {day,blocksDoneToday,streak,dueCards}, localMemory?: string }`
  → system = zaizaiSystem(memories, lesson, stats, mode) + GUARD;memories:account 用户读 D1 top12,
    否则用 cap(localMemory, 1200);brief 模式生成 ≤120 字晨报
  → 回复后 `ctx.waitUntil(extractMemories(env, uid, messages))`:llama json_schema 抽 0-3 条
    `{kind,text}` upsert 进 memories(仅 account 用户;text≤200,总量每用户≤60,超量删 weight 最低)
  → `{ reply }`
- `POST /ai/scenario`(同 handleAI 内)
  body `{ place: string(≤80), lesson?: LessonCtx }`
  → llama json_schema:`{ title_zh, role_zh, opener_en, phrases: [{en,zh}]×5, words: [{word,ipa,zh}]×3 }`
  → `{ pack }`(place 进 user turn,不进 system;GUARD 照旧)
- `POST /grok/token` 改造:body 增加 `scenario?: string`(cap 400)折进 tutorInstructions 末尾
  (`When roleplay context is given, stay in character: {scenario}`);
  计费:member → 原 rt 日额度;非 member → 先试 FREE_REALTIME_QUOTA(rt bucket),
  耗尽后尝试钱包 `UPDATE wallet SET balance_seconds = balance_seconds - 300 WHERE user_id=? AND balance_seconds >= 300`
  (changes=1 即成功,记 ledger `spend:grok_call`),都不行 → 429 `{error:'额度不足,完成今日练习可赚通话时长'}`;
  成功后若无 first_call 徽章则授予,响应加 `walletSpent: boolean`
- `/health` features 增加 `wallet: !!(env.DB && env.SESSION_SECRET)`
- **/agents WS 鉴权**:index.ts 在 routeAgentRequest 前对 `/agents/` 路径先 `identify(req, env)`,
  空 uid/未授权 → 401(cookie 和 x-app-passcode 在同源 WS upgrade 会带;开放模式 IP uid 照常放行)

### 3.3 zaizai persona(zaizai.ts,服务端唯一真源)

在在人设:中文为主的双语学伴,损友偏暖,句短(≤3 句),禁 AI 客套("作为AI…"),
练习内容用英文、点评用中文;开场/晨报引用 stats 与 memories 里的具体事实;
永远以一个具体的、小的、可答应的建议收尾。Day30(stats.day===30 且完成)才可提 Vāgīśvara 彩蛋。

## 4. 前端契约

### 4.1 新文件(归属 C,除注明外)

- `lib/zaizai.ts`:API client(zaizaiChat/zaizaiBrief/genScenario/getWallet/postEarn,走 ai.ts post 模式,
  wallet/earn 用独立 fetch+credentials);本地消息存储 `zaizai:chat:v1`(≤60 条,{id,role,kind,payload,at},
  kind: 'text'|'task-card'|'scenario-pack'|'brief'|'call-summary');本地记忆 `zaizai:memory:v1`(guest 用,≤12 条);
  晨报日戳 `zaizai:brief:date`(本地日期,复用 srs.ts toISODate 风格的本地日期,禁 toISOString)
- `components/zaizai/ChatHome.tsx`:默认页。结构:ProgressCard(sticky)→ 消息列表 → 场景快捷条 → InputBar。
  首开当日:插晨报(有 stats)或静态问候(AI 不可用时模板降级);今日未完成 block → 在在派发 task-card
  (深链 `/day/{current}?b={key}`,文案由 BLOCKS meta 生成,不调 AI);
  输入走 zaizaiChat(lesson=当前 day ctx);右侧麦克风按钮 → CallSheet
- `components/zaizai/ProgressCard.tsx`:玻璃卡,Day X/30 大数字(t-doto 沿用)+ 今日 n/5 块 + streak 火苗 +
  钱包余额 chip(有 wallet cap 时);tap → /course
- `components/zaizai/CallSheet.tsx`:底部 Sheet 包 AiPartner(lesson, scenario?)——复用既有 tier 链,不重写
- `components/zaizai/ScenarioCard.tsx`(归属 S):场景包玻璃卡(phrases 可点发音 speak()、words t-ipa)+
  三按钮:文字演练(把 pack 折成 scenario 字符串喂 ConversationPanel 流)/ 实战电话(CallSheet 带 scenario)/
  完成(postEarn scenario_complete + 本地场景计数 + toast)
- `components/Me.tsx`(归属 M):钱包卡(余额分钟化显示+赚取规则表+今日台账)、徽章墙(BADGES 镜像,
  未获得灰显)、账号卡(复用 openAccount()/AccountSheet,不重写)、链接行(数据与设置→/progress)
- guest 降级:wallet 卡换「注册开启额度钱包」CTA(openAccount)

### 4.2 改动(归属见注)

- `App.tsx`(C):NAV 重排+路由+/ai redirect+TutorFab 移除;`main.tsx`(C):BUILD='v3.0'
- `blocks/SpeakingBlock.tsx` AiPartner(S):scenario 传入 GrokLiveTutor;`GrokLiveTutor.tsx`(S):
  props 加 scenario?,声线锁(rex 需 streak_7 徽章、leo 需 scenario_3,来自 getWallet 缓存,未登录不锁 emma/aria/sam);
  `lib/grokRealtime.ts`(S):StartOpts 加 scenario?,mint body 透传
- `DayView.tsx`(M):complete() 后追加 postEarn block_complete / day_complete / streak_milestone
  (fire-and-forget,失败静默;guest 直接跳过)
- `lib/caps.ts`(M):ServerCaps 加 wallet;`components/ai.tsx` AccountSheet(M):免费版行下加
  「完成练习可赚通话时长」提示(有 wallet cap 时)

### 4.3 iOS Liquid Glass 主题(归属 T,只动此清单)

`index.css` @theme 值全换(token 名不动):
```
bg #f2f2f7 · surface #ffffff · surface-2 #e9e9ee · elevated #ffffff · hover #e4e4ea
border rgba(60,60,67,.12) · border-soft rgba(60,60,67,.08) · border-strong rgba(60,60,67,.24)
fg #0a0a0f · fg-secondary #3c3c43(.85) · fg-muted rgba(60,60,67,.6) · fg-dim rgba(60,60,67,.35)
brand #0a7cff · brand-hover #006fee · brand-fg #ffffff · accent-soft rgba(10,124,255,.08)
red→#ff3b30 · red-soft rgba(255,59,48,.10) · live #30d158 · success #34c759 · warning #ff9f0a
shadows → iOS 柔影(低 y 扩散、rgba(0,0,0,.04-.16));--font-sans 以 -apple-system,'SF Pro Text' 领跑,
PingFang SC 随后,Geist 移除引用(@fontsource import 可留包但不 import);Doto/mono/hand 保留
```
新增 utilities:`.glass`(backdrop-filter: blur(20px) saturate(1.8); background: rgba(255,255,255,.72);
border: 0.5px solid rgba(255,255,255,.6); box-shadow 内高光+外柔影)、`.glass-strong`(nav/tab 用 .85)、
`.bubble-me`(iMessage 蓝渐变 #0a7cff→#0064e1, text white, r18/r4)、`.bubble-ai`(#e9e9eb, fg, r18/r4)。
body 背景:去纸纹/点阵,换极淡冷灰渐变;ambient blob 改 iOS 柔彩(蓝/紫/青,透明度减半)。
token 旁路清单(全数处理):blocks.ts PHASE_INFO(墨/琥珀/朱砂 → iOS gray #8e8e93 / orange #ff9f0a / blue #0a7cff,
softBg 同步)、App.tsx#3ad07a→var(--color-live) 直写 hex #30d158、ui/index.tsx SCRIM→bg-black/40、
Progress.tsx:194 内联 scrim 同步、index.css 内部 rgba(hero-card 渐变→白玻璃、ink-underline/sketch-divider SVG
stroke 色→#0a7cff/#c7c7cc、::selection→brand、ambient 三色、grain 移除)、ListeningBlock 播放钮阴影。
`index.html`:theme-color #f2f2f7、color-scheme light、apple status bar 'default'、
title/apple-title「语自在 · 30天英语」;`vite.config.ts` manifest:name「语自在 · 30 Days English 英语听说」、
short_name「语自在」、theme_color/background_color #f2f2f7,**改完删除 vite.config.js**(tsc 会再生成,
构建脚本顺序已保证 .js 是新的;dev 前须重删或重 build——在 PLAN 顶部注明)。
新 API 路径加进 dev proxy:`/wallet`、`/earn`(/ai 前缀已覆盖 zaizai/scenario)。
动效 5 原语与 reduced-motion 全保留;animate-in-up 的 backwards fill 不许改。

## 5. 实施顺序与验收

1. **W(worker)∥ T(theme)**:目录不相交(worker/ vs app/)
2. **C(ChatHome+壳)**:依赖 W 的接口与 T 的 glass 工具类
3. **S(场景+Grok 线)∥ M(Me+经济接线)**:文件不相交(见 4.2 归属)
4. **V(验证)**:`cd worker && npx tsc --noEmit`、`cd app && npx tsc -b && npm run build`
   (先删 vite.config.js 再 build)、修所有编译错;headless 冒烟见 §6

每个 agent 完成时自行跑归属范围内的 tsc,不许留编译错给下游。

## 6. 冒烟清单(V + 主会话)

/health 有 wallet 字段;未登录 GET /wallet=401;注册测试号→ earn block_complete(重复 ref 幂等)→
balance 变化 → grok/token 走 wallet 扣费路径(可 mock 无 XAI 环境仅查逻辑分支)→ /ai/zaizai brief/chat 返回;
/ai/scenario 返回合法 pack;/agents 匿名(无 cookie/passcode,开放模式除外)→ 401;
前端 build 后 dist 里 manifest 颜色/名称已更新。

## 7. 明确不做(v3.0)

Web Push、Stripe 真支付、邮箱找回、暗色模式、CFLiveTutor 的 lesson/scenario 注入(DO 侧,下轮)、
场景补完课程 block、口令门去留。

---

## 8. v3.1 追加契约(2026-07-04 用户反馈轮)

### 8.1 富卡片消息(F1)
- 聊天条目 kind 扩展:`vocab-card`(翻转词卡 {word,ipa,zh,example_en})、`drill-card`(跟读挑战 {text,tip},录音→scorePronunciation→在在点评)、`listen-card`(语音气泡 {text,label},cfSpeak 播放)、`review-card`({due:number} 深链 /review)、`award-card`({seconds?,badge?} 到账动效)、`news-card`({title,level,summary_en,glossary:[{word,zh}],source})
- worker `/ai/zaizai` 响应扩展:`{ reply, card?: { kind, data } }`——在在可按语境携带一张卡(prompt 引导:用户问单词→vocab-card;要练发音→drill-card;要听→listen-card);前端渲染 reply 气泡后追加卡片条目
- `GET /ai/news`:worker fetch VOA Learning English RSS(learningenglish.voanews.com),KV 缓存 6h,llama json_schema 简化到 A2-B1+5 词 glossary;失败降级 502,前端回退"今日话题"生成

### 8.2 记忆可见 + Web Push(W2+F2)
- `GET /memories` → {memories:[{id,kind,text,at}]};`DELETE /memories/:id`(本人);Me 页「在在记得你」墙 + 聊天抽取后系统芯片"在在记住了:…"(chat 响应加 `remembered?: string[]`)
- D1 0004_push.sql:`push_subs(user_id, endpoint TEXT PK, p256dh, auth, created_at)`
- `/push/vapid`(公钥)、`POST /push/subscribe`、`POST /push/unsubscribe`;推送为**无载荷 tickle**(免 RFC8291 加密),SW push 事件 fetch `/zaizai/push-preview`(cookie 同源,返回个性化一句话)→ showNotification
- VAPID:公钥进 wrangler.toml vars,私钥 secret `VAPID_PRIVATE_KEY`(用户设);/health features.push = !!私钥;ES256 JWT 用 WebCrypto 手写
- Cron `0 23 * * *`(=北京 07:00)scheduled handler → 给全部订阅发 tickle
- PWA 从 generateSW 切 **injectManifest**(src/sw.ts:precacheAndRoute + skipWaiting/clientsClaim + push/notificationclick 处理器)——保持既有即时更新语义
- 应用内主动性(不依赖推送):visibilitychange 回归问候(>4h 离开)、当日已学完晚间复盘消息

### 8.3 安置对话(F2)
- 首开(无 profile 记忆时)在在三问:目标(考试/旅行/工作/兴趣)→ 自评水平(听不懂/能蹦词/能对话)→ 每日时间(15/30/60min);答案写 memory kind `pref`;brief prompt 引用 profile 调整派发侧重;可跳过

### 8.4 付费墙与三层可视(F3)
- `PlanSheet.tsx`:三列对比(免费=每日体验额度+学习赚时长 / 会员=额度放开+云同步 / 课程包=敬请期待),CTA:去学习赚 / 输激活码 / Stripe(payment cap 亮才显)
- 触发点:Grok 429 额度不足、钱包不足以打电话时的实战电话按钮、Me 会员卡「升级」
- GrokLiveTutor 429 错误 → 弹 PlanSheet(替换纯文字报错)

### 8.5 新用户流程(F2)
- 首开序列:欢迎语 → 安置三问 → `a2hs-card`(iOS 加主屏图文步骤,已安装则跳过 via display-mode)→ `register-card`(收益:云同步+赚额度+记忆)→ `push-card`(开启在在的morning call;iOS 未安装则先 a2hs)→ 第一课任务卡
- 卡片可稍后/跳过,状态存 localStorage `zaizai:onboard:v1`

### 8.6 文件归属
- W2:worker/**(0004 迁移、push.ts、news、zaizai card/remembered、memories 端点、cron、wrangler.toml vars+triggers)
- F1:lib/zaizai.ts、components/zaizai/cards/*.tsx(新)、ChatHome.tsx(卡片渲染+在在 card 响应)
- F2:components/zaizai/Onboarding.tsx(新)、lib/push.ts(新)、src/sw.ts(新)、vite.config.ts(injectManifest+proxy /push /memories)、ChatHome.tsx 接入(F1 之后跑)
- F3:PlanSheet.tsx(新)、Me.tsx、ai.tsx、GrokLiveTutor.tsx、caps.ts(push cap)
