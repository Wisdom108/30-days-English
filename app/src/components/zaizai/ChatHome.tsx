import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Check, ChevronRight, Mic, Sparkles, X } from 'lucide-react'
import { useApp } from '../../state'
import { useAuth } from '../../auth'
import { features } from '../../config'
import { getLesson, TOTAL_DAYS } from '../../data/curriculum'
import { addDays, dueCards, todayISO } from '../../lib/srs'
import { displayStreak, getDayProgress, isDayComplete, studiedToday } from '../../lib/storage'
import { BLOCKS } from '../../blocks'
import { aiChat, AIError, type ChatMsg, type LessonCtx } from '../../lib/ai'
import {
  briefShownToday,
  cardEntry,
  fetchNews,
  genScenario,
  getWallet,
  loadChat,
  localMemoryText,
  markBriefShown,
  newId,
  nextScenarioRef,
  postEarn,
  pushLocalMemory,
  saveChat,
  walletCap,
  zaizaiBrief,
  zaizaiChat,
  type AwardCardPayload,
  type ChatEntry,
  type DrillCardPayload,
  type ListenCardPayload,
  type NewsCardPayload,
  type ReviewCardPayload,
  type ScenarioPack,
  type TaskCardPayload,
  type VocabCardPayload,
  type ZaizaiStats,
} from '../../lib/zaizai'
import { openAccount } from '../ai'
import { BlockIcon } from '../blockicons'
import { useToast } from '../ui/toast'
import ProgressCard from './ProgressCard'
import ScenarioCard from './ScenarioCard'
import CallSheet from './CallSheet'
import Onboarding, { onboardingPending } from './Onboarding'
import { AwardCard, DrillCard, ListenCard, NewsCard, ReviewCard, VocabCard } from './cards'
import { cn } from '../../lib/utils'

const PRESETS = ['机场', '点餐', '打车', '酒店', '问路', '购物']

// in-app proactivity stamps (§8.2) — all LOCAL dates / epoch ms in localStorage
const SEEN_KEY = 'zaizai:lastSeen' // last time the tab was visible (epoch ms)
const WB_KEY = 'zaizai:welcomeback:date' // welcome-back shown (1/day)
const RECAP_KEY = 'zaizai:recap:date' // evening recap shown (1/day)

export default function ChatHome() {
  const { state } = useApp()
  const { user, loading } = useAuth()
  const nav = useNavigate()
  const { toast } = useToast()

  const current = Math.min(state.currentDay, TOTAL_DAYS)
  const lesson = getLesson(current)
  const lessonCtx: LessonCtx = lesson
    ? { day: lesson.day, theme: lesson.theme, title_en: lesson.title_en, grammar: lesson.grammarNote?.point_en, level: 'A2-B1' }
    : {}
  const prog = getDayProgress(state, current)
  const stats: ZaizaiStats = {
    day: current,
    blocksDoneToday: Object.values(prog.completedBlocks).filter(Boolean).length,
    streak: displayStreak(state),
    dueCards: dueCards(state.cards).length,
  }
  // "Finished studying TODAY": completing a day advances currentDay, so the
  // fresh day's block count reads 0 — check the current day OR the previous
  // day having been completed today. The studiedToday conjunct keeps a long-
  // finished Day 30 from counting every night forever.
  const doneToday =
    studiedToday(state) && (isDayComplete(state, current) || state.days[current - 1]?.completedAt === todayISO())

  const [entries, setEntries] = useState<ChatEntry[]>(() => loadChat())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [scenarioMode, setScenarioMode] = useState(false)
  const [roleplay, setRoleplay] = useState<string | null>(null)
  const [callOpen, setCallOpen] = useState(false)
  const [callScenario, setCallScenario] = useState<string | undefined>(undefined)
  // v3.1 安置流程 (§8.3/§8.5):active 时压住晨报派发,onDone 后正常派发首任务卡
  const [onboarding, setOnboarding] = useState(onboardingPending)

  useEffect(() => saveChat(entries), [entries])

  const push = (e: Omit<ChatEntry, 'id' | 'at'>) =>
    setEntries((es) => [...es, { ...e, id: newId(), at: Date.now() }])

  // Guests carry their own local notes; account users get D1 memories server-side.
  const guestMemory = () => (user?.account ? undefined : localMemoryText() || undefined)

  // ---- morning dispatch: once per LOCAL day — brief (or static greeting) + task cards
  const bootRef = useRef<string | null>(null) // last-dispatched local date
  const [wakeTick, setWakeTick] = useState(0) // bumped on tab wake → re-checks the date after midnight
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && setWakeTick((t) => t + 1)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  // Latest render values for the (possibly delayed) dispatch — CloudSync may
  // import fresher state while we wait for it to settle.
  const liveRef = useRef({ stats, lessonCtx, prog, current, lastStudy: state.lastStudyDate, doneToday })
  liveRef.current = { stats, lessonCtx, prog, current, lastStudy: state.lastStudyDate, doneToday }
  useEffect(() => {
    if (loading || onboarding || bootRef.current === todayISO() || briefShownToday()) return
    const dispatch = () => {
      if (bootRef.current === todayISO() || briefShownToday()) return
      bootRef.current = todayISO()
      const { stats, lessonCtx, prog, current, lastStudy } = liveRef.current
      const tasks: ChatEntry[] = BLOCKS.filter((b) => !prog.completedBlocks[b.key]).map((b) => ({
        id: newId(),
        role: 'assistant',
        kind: 'task-card',
        payload: { day: current, key: b.key, title_zh: b.title_zh, minutes: b.minutes },
        at: Date.now(),
      }))
      // Due reviews ride the same synchronous batch as the task cards.
      const batch: ChatEntry[] = [...tasks]
      if (stats.dueCards > 0)
        batch.push({ id: newId(), role: 'assistant', kind: 'review-card', payload: { due: stats.dueCards }, at: Date.now() })
      // Task cards land + persist SYNCHRONOUSLY (write-through) — an unmount
      // during the brief fetch can no longer lose them. Mark the day here, where
      // entries are actually persisted.
      saveChat([...loadChat(), ...batch])
      setEntries((es) => [...es, ...batch])
      markBriefShown()
      const fallback =
        `早!今天是 Day ${current}/30${stats.streak > 0 ? `,已经连着学了 ${stats.streak} 天` : ''}。` +
        (tasks.length ? '今天的练习清单在下面,先挑一块开始?' : '今天的 5 块练习都完成了,来聊两句或练个场景?')
      // Write-through too: insert the brief BEFORE its task cards straight into
      // storage, so it persists even if this component unmounted mid-fetch.
      const finish = (text: string, kind: 'brief' | 'text') => {
        const entry: ChatEntry = { id: newId(), role: 'assistant', kind, payload: text, at: Date.now() }
        const insert = (es: ChatEntry[]) => {
          const i = batch.length ? es.findIndex((e) => e.id === batch[0].id) : -1
          return i < 0 ? [...es, entry] : [...es.slice(0, i), entry, ...es.slice(i)]
        }
        saveChat(insert(loadChat()))
        setEntries(insert)
      }
      if (features.ai && user) {
        setBusy(true)
        zaizaiBrief(stats, lessonCtx, guestMemory())
          .then(({ reply }) => finish(reply, 'brief'))
          .catch(() => finish(fallback, 'text'))
          .finally(() => setBusy(false))
        // Daily news trails the task cards — write-through append; silent-fail skip.
        fetchNews().then((n) => {
          if (!n) return
          const entry: ChatEntry = { id: newId(), role: 'assistant', kind: 'news-card', payload: n, at: Date.now() }
          saveChat([...loadChat(), entry])
          setEntries((es) => [...es, entry])
        })
      } else {
        finish(fallback, 'text')
      }
      // Freeze offer(牵挂 tone): yesterday missed + a freeze in the wallet →
      // 在在 says it'll auto-apply on today's first block (auto-consume in
      // DayView, no button). Write-through append, silent-fail skip.
      if (user?.account && walletCap() && lastStudy === addDays(todayISO(), -2)) {
        // forced fetch: the cached wallet may predate another device spending
        // the last freeze — gated on the 2-day-gap check, so ≤1/day.
        getWallet(true).then((w) => {
          if (!w || w.freezes <= 0) return
          const entry: ChatEntry = {
            id: newId(),
            role: 'assistant',
            kind: 'text',
            payload: `昨天没等到你,有点牵挂。好在你还有 ${w.freezes} 张冻结券❄️——今天完成任意一块,我自动帮你把连胜续上。`,
            at: Date.now(),
          }
          saveChat([...loadChat(), entry])
          setEntries((es) => [...es, entry])
        })
      }
    }
    if (user?.account) {
      // Fresh device: wait for CloudSync's initial adopt/merge (or 4s) so the
      // brief reads post-sync progress. setTimeout(0) lets React flush the
      // imported state first; per-day guards make re-runs no-ops.
      let fired = false
      const go = () => {
        if (fired) return
        fired = true
        setTimeout(dispatch, 0)
      }
      const t = setTimeout(go, 4000)
      window.addEventListener('zaizai-sync-settled', go)
      return () => {
        clearTimeout(t)
        window.removeEventListener('zaizai-sync-settled', go)
      }
    }
    dispatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, wakeTick, user?.account, onboarding])

  // ---- in-app proactivity (§8.2): welcome-back after >4h away SAME local day
  // (a cross-midnight return is greeted by the morning brief instead) + evening
  // recap once all blocks are done and it's 20:00+. Both throttled 1/day.
  // Runs on mount + tab wake (wakeTick) + block completions; the tab-hide
  // listener keeps lastSeen fresh so the away gap is measured from departure.
  useEffect(() => {
    if (loading || onboarding) return
    const today = todayISO()
    const { stats, doneToday } = liveRef.current
    try {
      const now = Date.now()
      const last = Number(localStorage.getItem(SEEN_KEY) || 0)
      localStorage.setItem(SEEN_KEY, String(now))
      if (
        last &&
        now - last > 4 * 3600_000 &&
        new Date(last).toDateString() === new Date(now).toDateString() &&
        localStorage.getItem(WB_KEY) !== today
      ) {
        localStorage.setItem(WB_KEY, today)
        push({
          role: 'assistant',
          kind: 'text',
          payload: doneToday
            ? '回来啦!今天的练习都清完了,来聊两句或练个场景?'
            : `回来啦!今天还差 ${BLOCKS.length - stats.blocksDoneToday} 块,先挑一块热热身?`,
        })
      }
      if (doneToday && new Date().getHours() >= 20 && localStorage.getItem(RECAP_KEY) !== today) {
        localStorage.setItem(RECAP_KEY, today)
        push({
          role: 'assistant',
          kind: 'text',
          payload:
            `今天 ${BLOCKS.length}/${BLOCKS.length} 全部完成,漂亮。` +
            (stats.streak > 1 ? `连续 ${stats.streak} 天了。` : '') +
            (stats.dueCards > 0 ? `还有 ${stats.dueCards} 张复习到期,睡前清一下?` : '早点休息,明天见。'),
        })
      }
    } catch {
      /* storage broken — skip */
    }
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      try {
        localStorage.setItem(SEEN_KEY, String(Date.now()))
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, onboarding, wakeTick, stats.blocksDoneToday, doneToday])

  // Old dispatchers (command palette etc.) keep working: open the call sheet.
  useEffect(() => {
    const openIt = () => {
      setCallScenario(undefined)
      setCallOpen(true)
    }
    window.addEventListener('open-tutor', openIt)
    return () => window.removeEventListener('open-tutor', openIt)
  }, [])

  // ---- autoscroll: jump on mount, glide on new messages
  const endRef = useRef<HTMLDivElement>(null)
  const firstScroll = useRef(true)
  useEffect(() => {
    const behavior = firstScroll.current ? 'auto' : 'smooth'
    firstScroll.current = false
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior, block: 'end' }))
  }, [entries.length, busy])

  const errBubble = (e: unknown) =>
    push({ role: 'assistant', kind: 'text', payload: `(${e instanceof AIError ? e.message : '出错了,请重试'})` })

  const runScenario = async (place: string) => {
    if (busy || !features.ai) return
    if (!user) return openAccount()
    push({ role: 'user', kind: 'text', payload: `场景演练:${place}` })
    setBusy(true)
    try {
      const { pack } = await genScenario(place, lessonCtx)
      if (!user.account) pushLocalMemory(`学员想练的场景:${place}`)
      push({ role: 'assistant', kind: 'scenario-pack', payload: pack })
    } catch (e) {
      errBubble(e)
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy || !features.ai) return
    if (!user) return openAccount()
    setInput('')
    if (scenarioMode) {
      setScenarioMode(false)
      return runScenario(text)
    }
    const mine: ChatEntry = { id: newId(), role: 'user', kind: 'text', payload: text, at: Date.now() }
    setEntries((es) => [...es, mine])
    setBusy(true)
    try {
      const history: ChatMsg[] = [...entries, mine]
        .filter((e) => typeof e.payload === 'string' && e.kind !== 'task-card' && e.kind !== 'scenario-pack' && e.kind !== 'memory-chip')
        .slice(-8)
        .map((e) => ({ role: e.role, content: e.payload as string }))
      if (roleplay) {
        const { reply } = await aiChat(history, lessonCtx, roleplay)
        push({ role: 'assistant', kind: 'text', payload: reply })
      } else {
        const { reply, card, remembered } = await zaizaiChat(history, lessonCtx, stats, guestMemory())
        push({ role: 'assistant', kind: 'text', payload: reply })
        const ce = cardEntry(card) // 在在 may attach one contextual card after the bubble
        if (ce) push({ role: 'assistant', ...ce })
        if (remembered?.length)
          push({ role: 'assistant', kind: 'memory-chip', payload: remembered.join('、') })
      }
    } catch (e) {
      errBubble(e)
    } finally {
      setBusy(false)
    }
  }

  const startPractice = (pack: ScenarioPack, s: string) => {
    setRoleplay(s)
    push({ role: 'assistant', kind: 'text', payload: pack.opener_en })
  }

  const startCall = (s?: string) => {
    if (!user) return openAccount()
    setCallScenario(s)
    setCallOpen(true)
  }

  const earnPending = useRef(false)
  const finishScenario = (entryId: string) => {
    if (earnPending.current) return // postEarn in flight — no double-claim
    const cur = entries.find((en) => en.id === entryId)
    if (cur && (cur.payload as ScenarioPack & { done?: boolean }).done) return // already claimed
    setRoleplay(null)
    // Flag the pack done (persists via the saveChat effect) so 完成 can't be farmed.
    setEntries((es) =>
      es.map((en) =>
        en.id === entryId ? { ...en, payload: { ...(en.payload as ScenarioPack), done: true } as ScenarioPack } : en,
      ),
    )
    if (user?.account) {
      earnPending.current = true
      postEarn('scenario_complete', nextScenarioRef())
        .then((r) => {
          if (r && r.earned > 0) {
            toast({ title: `场景完成 · 赚到 ${Math.floor(r.earned / 60)} 分钟通话`, tone: 'success' })
            push({ role: 'assistant', kind: 'award-card', payload: { seconds: r.earned } })
          } else {
            toast({ title: '场景完成', tone: 'success' })
          }
          r?.newBadges?.forEach((b) => push({ role: 'assistant', kind: 'award-card', payload: { badge: b } }))
        })
        .finally(() => {
          earnPending.current = false
        })
    } else {
      toast({ title: '场景完成', description: '注册账号可赚取通话时长', tone: 'success' })
    }
    push({ role: 'assistant', kind: 'text', payload: '这个场景拿下了!想再练一个,还是打通电话实战一下?' })
  }

  const renderEntry = (e: ChatEntry) => {
    if (e.kind === 'task-card') {
      const t = e.payload as TaskCardPayload
      const done = !!getDayProgress(state, t.day).completedBlocks[t.key]
      return (
        <div key={e.id} className="flex">
          <button
            onClick={() => nav(`/day/${t.day}?b=${t.key}`)}
            className={cn('press glass flex w-full max-w-[88%] items-center gap-3 rounded-xl px-4 py-3 text-left', done && 'opacity-60')}
          >
            <BlockIcon k={t.key} size={18} className="shrink-0 text-fg-secondary" />
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-body font-medium', done ? 'text-fg-muted line-through' : 'text-fg')}>
                {t.title_zh}
              </span>
              <span className="text-meta text-fg-muted">Day {t.day} · {t.minutes} 分钟</span>
            </span>
            {done ? <Check size={15} className="shrink-0 text-success" /> : <ChevronRight size={15} className="shrink-0 text-fg-dim" />}
          </button>
        </div>
      )
    }
    if (e.kind === 'scenario-pack') {
      const pack = e.payload as ScenarioPack
      return (
        <div key={e.id} className="flex">
          <ScenarioCard pack={pack} onPractice={(s) => startPractice(pack, s)} onCall={startCall} onDone={() => finishScenario(e.id)} />
        </div>
      )
    }
    if (e.kind === 'vocab-card') return <div key={e.id} className="flex"><VocabCard data={e.payload as VocabCardPayload} /></div>
    if (e.kind === 'drill-card') return <div key={e.id} className="flex"><DrillCard data={e.payload as DrillCardPayload} lesson={lessonCtx} /></div>
    if (e.kind === 'listen-card') return <div key={e.id} className="flex"><ListenCard data={e.payload as ListenCardPayload} /></div>
    if (e.kind === 'review-card') return <div key={e.id} className="flex"><ReviewCard data={e.payload as ReviewCardPayload} /></div>
    if (e.kind === 'award-card') return <div key={e.id} className="flex"><AwardCard data={e.payload as AwardCardPayload} /></div>
    if (e.kind === 'news-card') return <div key={e.id} className="flex"><NewsCard data={e.payload as NewsCardPayload} /></div>
    if (e.kind === 'memory-chip') {
      // freeze notices (❄ prefix) are already full sentences — no 记住了 prefix
      const chip = String(e.payload)
      return (
        <div key={e.id} className="flex justify-center">
          <span className="animate-in-up max-w-[85%] truncate rounded-full bg-surface-2 px-3 py-1 text-meta text-fg-muted">
            {chip.startsWith('❄') ? chip : `在在记住了:${chip}`}
          </span>
        </div>
      )
    }
    const me = e.role === 'user'
    return (
      <div key={e.id} className={cn('flex', me && 'justify-end')}>
        <div className={cn('max-w-[85%] whitespace-pre-wrap px-3.5 py-2 text-body leading-relaxed', me ? 'bubble-me' : 'bubble-ai')}>
          {e.kind === 'brief' && <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em] opacity-60">今日晨报</div>}
          {String(e.payload)}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-[720px] flex-col">
      {/* progress spine — pinned under the app header */}
      <div className="sticky top-[calc(54px+env(safe-area-inset-top)+8px)] z-20">
        <ProgressCard />
      </div>

      {/* message feed — bottom padding clears the sticky input dock + mobile tab
          bar (~160px / ~116px on md) so autoscrolled messages never park behind them */}
      <div className="flex-1 space-y-2.5 pt-4 pb-40 md:pb-28">
        {entries.map(renderEntry)}
        {onboarding && (
          <Onboarding
            stats={stats}
            lesson={lessonCtx}
            append={(role, text) => push({ role, kind: 'text', payload: text })}
            onDone={() => setOnboarding(false)}
          />
        )}
        {busy && (
          <div className="flex">
            <div className="bubble-ai flex items-center gap-1 px-3.5 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} className="scroll-mb-40 md:scroll-mb-28" />
      </div>

      {/* input dock — quick scenarios + iMessage bar */}
      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 pb-1 md:bottom-4">
        {roleplay && (
          <div className="mb-2 flex justify-center">
            <button
              onClick={() => setRoleplay(null)}
              className="press flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-meta font-medium text-brand"
            >
              演练中 · {roleplay.split(' — ')[0]} <X size={12} />
            </button>
          </div>
        )}
        {features.ai && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => runScenario(p)}
                disabled={busy}
                className="press glass shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-fg-secondary disabled:opacity-45"
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setScenarioMode((m) => !m)}
              className={cn(
                'press shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium',
                scenarioMode ? 'bg-brand text-brand-fg' : 'glass text-fg-secondary',
              )}
            >
              <Sparkles size={13} /> 自定义
            </button>
          </div>
        )}
        <div className="glass-strong flex items-center gap-1.5 rounded-[22px] p-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
            disabled={!features.ai}
            placeholder={!features.ai ? 'AI 未配置 · 任务照常打卡' : scenarioMode ? '描述场景,如:和房东谈租房' : '给在在发消息…'}
            className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-body text-fg outline-none placeholder:text-fg-dim disabled:opacity-50"
          />
          <button
            onClick={() => startCall(undefined)}
            aria-label="语音通话"
            className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
          >
            <Mic size={18} />
          </button>
          <button
            onClick={send}
            disabled={!input.trim() || busy || !features.ai}
            aria-label="发送"
            className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-brand-fg transition-opacity disabled:opacity-35"
          >
            <ArrowUp size={17} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <CallSheet open={callOpen} onOpenChange={setCallOpen} lesson={lessonCtx} scenario={callScenario} />
    </div>
  )
}
