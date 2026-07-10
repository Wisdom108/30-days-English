import { useEffect, useRef, useState } from 'react'
import { Bell, Lock, Share, Smartphone, SquarePlus, UserPlus } from 'lucide-react'
import { useAuth } from '../../auth'
import { features } from '../../config'
import type { LessonCtx } from '../../lib/ai'
import { pushAvailable } from '../../lib/caps'
import { isStandalone, pushSupported, subscribe } from '../../lib/push'
import { loadChat, localMemoryText, pushLocalMemory, zaizaiChat, type ZaizaiStats } from '../../lib/zaizai'
import { openAccount } from '../ai'
import { useToast } from '../ui/toast'

// 安置对话 + 新用户流程 (§8.3/§8.5):欢迎 → 三问(目标/水平/时间,chips 快答)
// → A2HS → 注册 → 推送 → 完成(ChatHome 随即派发晨报+首任务卡)。文字气泡写进
// zaizai:chat:v1(经 ChatHome append);交互卡由状态机现场渲染,不进聊天存储。
// 状态机存 zaizai:onboard:v1,每步可稍后跳过。

// 'profile' is a transient marker persisted synchronously BEFORE the async
// finishProfile call — a reload mid-flight resumes at a2hs instead of replaying
// q3 (and re-posting the profile to the AI).
type Step = 'welcome' | 'q1' | 'q2' | 'q3' | 'profile' | 'a2hs' | 'register' | 'push' | 'done'
interface OnboardState {
  step: Step
  answers: { goal?: string; level?: string; time?: string }
  at?: number // last save timestamp — lets stale post-profile steps expire
}

const KEY = 'zaizai:onboard:v1'

function load(): OnboardState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const st = JSON.parse(raw) as OnboardState
      if (st && typeof st.step === 'string') {
        return { step: st.step, answers: st.answers || {}, at: typeof st.at === 'number' ? st.at : undefined }
      }
    }
  } catch {
    /* fresh */
  }
  return { step: 'welcome', answers: {} }
}

function save(st: OnboardState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...st, at: Date.now() }))
  } catch {
    /* ignore */
  }
}

// Post-profile steps (installed/registered/push prompts) are nice-to-haves; a
// user who parked there must not have the daily dispatch blocked forever.
const EXPIRABLE: Step[] = ['profile', 'a2hs', 'register', 'push']
const EXPIRE_MS = 48 * 60 * 60 * 1000

/** First-open check (ChatHome). Existing installs — chat history already there
 *  but no onboard key — are settled in: mark done instead of onboarding them. */
export function onboardingPending(): boolean {
  try {
    if (localStorage.getItem(KEY)) {
      const st = load()
      if (st.step === 'done') return false
      // Parked past the questions for >48h (missing timestamp = legacy = expired)
      // → settle as done so the morning brief + task cards dispatch again.
      if (EXPIRABLE.includes(st.step) && Date.now() - (st.at ?? 0) > EXPIRE_MS) {
        save({ step: 'done', answers: st.answers })
        return false
      }
      return true
    }
    if (loadChat().length > 0) {
      save({ step: 'done', answers: {} })
      return false
    }
    save({ step: 'welcome', answers: {} })
    return true
  } catch {
    return false
  }
}

const QUESTIONS: Record<'q1' | 'q2' | 'q3', { key: 'goal' | 'level' | 'time'; ask: string; options: string[] }> = {
  q1: { key: 'goal', ask: '第一问:这次学英语,主要为了什么?', options: ['考试', '旅行', '工作', '兴趣'] },
  q2: { key: 'level', ask: '第二问:现在的听说水平,更接近哪种?', options: ['基本听不懂', '能蹦单词', '能简单对话'] },
  q3: { key: 'time', ask: '最后一问:每天能拿出多少时间?', options: ['15 分钟', '30 分钟', '60 分钟'] },
}

const WELCOME = '嗨,我是在在,往后 30 天陪你把英语听说练出来的那位。先答三个小问题,我好照你的情况安排。'

export default function Onboarding({
  stats,
  lesson,
  append,
  onDone,
}: {
  stats: ZaizaiStats
  lesson: LessonCtx
  append: (role: 'user' | 'assistant', text: string) => void
  onDone: () => void
}) {
  const { user, mode, loading } = useAuth()
  const { toast } = useToast()
  const [st, setSt] = useState<OnboardState>(load)
  const [busy, setBusy] = useState(false)

  // register 只在账号模式下有意义 — open/passcode/access 模式下 openAccount 是
  // 空操作,这一步必须跳过(identity 未加载完前不武断跳)。
  const skipRegister = (): boolean => !!user?.account || !features.worker || (!loading && mode !== 'account')

  const go = (next: Step, answers = st.answers) => {
    // 自动跳过:已装到主屏 → 免 A2HS;已有账号/非账号模式/无服务端 → 免注册;无服务端 → 免推送
    if (next === 'a2hs' && isStandalone()) next = 'register'
    if (next === 'register' && skipRegister()) next = 'push'
    if (next === 'push' && !features.worker) next = 'done'
    const s: OnboardState = { step: next, answers }
    save(s)
    setSt(s)
    if (next === 'done') onDone()
  }

  // 首开:欢迎语 + 第一问(以持久化的 step 为幂等闸,StrictMode 双跑安全)
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const cur = load()
    if (cur.step === 'welcome') {
      append('assistant', WELCOME)
      append('assistant', QUESTIONS.q1.ask)
      go('q1')
    } else if (cur.step === 'profile') {
      // 上次在 finishProfile 半途中断 — 三问答案已持久化,直接续到 a2hs,
      // 绝不重放 q3 / 重发 profile。
      go('a2hs', cur.answers)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 装完从主屏重开、注册完成回来时,把停在旧步骤的状态机推过去。
  useEffect(() => {
    if (st.step === 'a2hs' && isStandalone()) go('register')
    else if (st.step === 'register' && skipRegister()) go('push')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.step, user?.account, mode, loading])

  const finishProfile = async (answers: OnboardState['answers']) => {
    const parts: string[] = []
    if (answers.goal) parts.push(`学英语主要为了${answers.goal}`)
    if (answers.level) parts.push(`现在${answers.level}`)
    if (answers.time) parts.push(`每天能学 ${answers.time}`)
    if (!user?.account) {
      // guests:profile 存本地记忆,随后每次 zaizaiChat 作为 localMemory 带上
      if (answers.goal) pushLocalMemory(`学习目标:${answers.goal}`)
      if (answers.level) pushLocalMemory(`自评水平:${answers.level}`)
      if (answers.time) pushLocalMemory(`每日时间:${answers.time}`)
    }
    if (!parts.length || !features.ai || !user) {
      append('assistant', parts.length ? '记下了,就按这个节奏来。' : '没关系,边学边聊。')
      return go('a2hs', answers)
    }
    setBusy(true)
    try {
      // 走 zaizaiChat:worker 侧的记忆抽取会把 profile 存进 D1(账号用户)。
      const { reply } = await zaizaiChat(
        [{ role: 'user', content: `我的情况:${parts.join(';')}。之后请按这个安排我的练习。` }],
        lesson,
        stats,
        user.account ? undefined : localMemoryText() || undefined,
      )
      append('assistant', reply)
    } catch {
      append('assistant', '记下了,就按这个节奏来。')
    } finally {
      setBusy(false)
      go('a2hs', answers)
    }
  }

  const answer = (choice: string | null) => {
    if (busy || (st.step !== 'q1' && st.step !== 'q2' && st.step !== 'q3')) return
    const q = QUESTIONS[st.step]
    const answers = { ...st.answers }
    if (choice) {
      answers[q.key] = choice
      append('user', choice)
    } else {
      append('user', '先跳过')
    }
    if (st.step === 'q1') {
      append('assistant', QUESTIONS.q2.ask)
      return go('q2', answers)
    }
    if (st.step === 'q2') {
      append('assistant', QUESTIONS.q3.ask)
      return go('q3', answers)
    }
    // q3 答完:先同步落盘 'profile' 再走异步 finishProfile — 中途刷新/崩溃时
    // 从 'profile' 恢复(跳到 a2hs),不会重放第三问、也不会重发 profile。
    const s: OnboardState = { step: 'profile', answers }
    save(s)
    setSt(s)
    void finishProfile(answers)
  }

  const enablePush = async () => {
    if (busy) return
    setBusy(true)
    const r = await subscribe()
    setBusy(false)
    if (r.ok) {
      toast({ title: '晨呼已开启,明早见', tone: 'success' })
      append('assistant', '搞定,明早我叫你。现在从第一课开始?')
      go('done')
    } else {
      toast({ title: r.reason || '开启失败', tone: 'error' })
    }
  }

  const ghost = 'press rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted disabled:opacity-45'
  const primary = 'press rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-fg disabled:opacity-45'

  // ---- step cards (live, not persisted) ----
  if (st.step === 'q1' || st.step === 'q2' || st.step === 'q3') {
    const q = QUESTIONS[st.step]
    return (
      <div className="flex">
        <div className="animate-in-up card-solid max-w-[88%] rounded-xl px-3.5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <button key={o} onClick={() => answer(o)} disabled={busy} className="press rounded-full bg-accent-soft px-3.5 py-1.5 text-sm font-medium text-brand disabled:opacity-45">
                {o}
              </button>
            ))}
            <button onClick={() => answer(null)} disabled={busy} className={ghost}>
              跳过
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (st.step === 'a2hs') {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    return (
      <div className="flex">
        <div className="animate-in-up card-solid max-w-[88%] rounded-xl px-4 py-3.5">
          <div className="flex items-center gap-2 text-body font-medium text-fg">
            <Smartphone size={16} className="shrink-0 text-brand" /> 把在在装到主屏幕
          </div>
          <div className="mt-1 text-meta text-fg-muted">装成 App 离线也能学,也是开启每日提醒的前提。</div>
          {ios ? (
            <ol className="mt-2.5 space-y-1.5 text-sm text-fg-secondary">
              <li className="flex items-center gap-1.5">
                <span className="t-tab font-semibold text-fg-dim">1</span> 点浏览器工具栏的 <Share size={14} className="shrink-0 text-brand" /> 分享按钮
              </li>
              <li className="flex items-center gap-1.5">
                <span className="t-tab font-semibold text-fg-dim">2</span> 往下滑,选 <SquarePlus size={14} className="shrink-0 text-brand" /> 「添加到主屏幕」
              </li>
              <li className="flex items-center gap-1.5">
                <span className="t-tab font-semibold text-fg-dim">3</span> 回到主屏幕,从新图标打开
              </li>
            </ol>
          ) : (
            <div className="mt-2.5 text-sm text-fg-secondary">在浏览器菜单里选「安装应用 / 添加到主屏幕」即可。</div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => go('register')} className={primary}>
              装好了
            </button>
            <button onClick={() => go('register')} className={ghost}>
              稍后
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (st.step === 'register') {
    return (
      <div className="flex">
        <div className="animate-in-up card-solid max-w-[88%] rounded-xl px-4 py-3.5">
          <div className="flex items-center gap-2 text-body font-medium text-fg">
            <UserPlus size={16} className="shrink-0 text-brand" /> 注册一个账号
          </div>
          <div className="mt-1 text-meta text-fg-muted">进度云同步 · 完成练习赚通话时长 · 在在长期记住你。</div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={openAccount} className={primary}>
              注册 / 登录
            </button>
            <button onClick={() => go('push')} className={ghost}>
              稍后
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (st.step === 'push') {
    // 能力判定只看 pushSupported() —— iOS 恰好只在装到主屏后才暴露 PushManager,
    // 桌面浏览器不装也能推。standalone/iOS 检测仅用于挑解释文案。
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const reason = !user?.account
      ? '需要账号(上一步注册)'
      : !pushSupported()
        ? ios && !isStandalone()
          ? '需要先装到主屏幕'
          : '此浏览器暂不支持通知'
        : !pushAvailable()
          ? '服务端推送未配置'
          : null
    return (
      <div className="flex">
        <div className="animate-in-up card-solid max-w-[88%] rounded-xl px-4 py-3.5">
          <div className="flex items-center gap-2 text-body font-medium text-fg">
            <Bell size={16} className="shrink-0 text-brand" /> 开启在在的 morning call
          </div>
          <div className="mt-1 text-meta text-fg-muted">每天早上一句话,把你拽回来学两句。</div>
          <div className="mt-3 flex items-center gap-2">
            {reason ? (
              <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-meta text-fg-muted">
                <Lock size={12} className="shrink-0" /> 待解锁 · {reason}
              </span>
            ) : (
              <button onClick={enablePush} disabled={busy} className={primary}>
                开启提醒
              </button>
            )}
            <button onClick={() => go('done')} disabled={busy} className={ghost}>
              稍后
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null // welcome / profile (transient) / done
}
