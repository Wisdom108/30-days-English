import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  type ChatEntry,
  type ScenarioPack,
  type TaskCardPayload,
  type ZaizaiStats,
} from '../../lib/zaizai'
import { openAccount } from '../ai'
import { useToast } from '../ui/toast'
import ProgressCard from './ProgressCard'
import CallSheet from './CallSheet'
import Onboarding, { onboardingPending } from './Onboarding'
import MessageFeed, { type FeedActions } from './MessageFeed'
import Composer from './Composer'

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
  const lessonCtx: LessonCtx = useMemo(
    () =>
      lesson
        ? { day: lesson.day, theme: lesson.theme, title_en: lesson.title_en, grammar: lesson.grammarNote?.point_en, level: 'A2-B1' }
        : {},
    [lesson],
  )
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
  // NOTE: the draft text lives inside <Composer/> — typing must not re-render the feed.
  const [busy, setBusy] = useState(false)
  const [scenarioMode, setScenarioMode] = useState(false)
  const [roleplay, setRoleplay] = useState<string | null>(null)
  const [callOpen, setCallOpen] = useState(false)
  const [callScenario, setCallScenario] = useState<string | undefined>(undefined)
  // v3.1 安置流程 (§8.3/§8.5):active 时压住晨报派发,onDone 后正常派发首任务卡
  const [onboarding, setOnboarding] = useState(onboardingPending)

  useEffect(() => saveChat(entries), [entries])

  // Latest entries for the stable action handlers (finishScenario/send read
  // through this — their identity must not chase the array).
  const entriesRef = useRef(entries)
  entriesRef.current = entries

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

  // Not signed in → open the account sheet. The sheet may not be mounted when
  // the /me probe failed (auth fell back), so also toast — a tap is never silent.
  const requireUser = (): boolean => {
    if (user) return true
    toast({ title: '请先登录', description: '若网络未连接,请稍后再试' })
    openAccount()
    return false
  }

  const runScenario = async (place: string) => {
    if (busy || !features.ai) return
    if (!requireUser()) return
    push({ role: 'user', kind: 'text', payload: `场景演练:${place}` })
    setBusy(true)
    try {
      const { pack } = await genScenario(place, lessonCtx)
      if (!user?.account) pushLocalMemory(`学员想练的场景:${place}`)
      push({ role: 'assistant', kind: 'scenario-pack', payload: pack })
    } catch (e) {
      errBubble(e)
    } finally {
      setBusy(false)
    }
  }

  /** Composer hands us a trimmed draft; false → it keeps the text (not signed
   *  in / busy), true → it clears the field. */
  const handleSend = (text: string): boolean => {
    if (busy || !features.ai) return false
    if (!requireUser()) return false
    if (scenarioMode) {
      setScenarioMode(false)
      void runScenario(text)
      return true
    }
    const mine: ChatEntry = { id: newId(), role: 'user', kind: 'text', payload: text, at: Date.now() }
    const history: ChatMsg[] = [...entriesRef.current, mine]
      .filter((e) => typeof e.payload === 'string' && e.kind !== 'task-card' && e.kind !== 'scenario-pack' && e.kind !== 'memory-chip')
      .slice(-8)
      .map((e) => ({ role: e.role, content: e.payload as string }))
    setEntries((es) => [...es, mine])
    setBusy(true)
    void (async () => {
      try {
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
    })()
    return true
  }

  const startPractice = (pack: ScenarioPack, s: string) => {
    setRoleplay(s)
    push({ role: 'assistant', kind: 'text', payload: pack.opener_en })
  }

  const startCall = (s?: string) => {
    if (!requireUser()) return
    setCallScenario(s)
    setCallOpen(true)
  }

  // Per-card in-flight ledger: a global boolean would swallow card B's 完成
  // while card A's earn is still posting. Same-card double-tap is blocked
  // here; DIFFERENT cards may post concurrently — each earn carries its own
  // ref and the worker is idempotent per ref.
  const earnPending = useRef(new Set<string>())
  const finishScenario = (entryId: string) => {
    if (earnPending.current.has(entryId)) return // this card's postEarn in flight — no double-claim
    const cur = entriesRef.current.find((en) => en.id === entryId)
    if (cur && (cur.payload as ScenarioPack & { done?: boolean }).done) return // already claimed
    setRoleplay(null)
    // Flag the pack done (persists via the saveChat effect) so 完成 can't be farmed.
    setEntries((es) =>
      es.map((en) =>
        en.id === entryId ? { ...en, payload: { ...(en.payload as ScenarioPack), done: true } as ScenarioPack } : en,
      ),
    )
    if (user?.account) {
      earnPending.current.add(entryId)
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
          earnPending.current.delete(entryId)
        })
    } else {
      toast({ title: '场景完成', description: '注册账号可赚取通话时长', tone: 'success' })
    }
    push({ role: 'assistant', kind: 'text', payload: '这个场景拿下了!想再练一个,还是打通电话实战一下?' })
  }

  // ---- stable action surface (v3.2 §12): identity NEVER changes, latest
  // implementations are read through implRef — so the memoized MessageFeed /
  // Composer rows aren't re-rendered by fresh closures every parent render.
  const impl = {
    task: (t: TaskCardPayload) => nav(`/day/${t.day}?b=${t.key}`),
    practice: startPractice,
    call: startCall,
    done: finishScenario,
    send: handleSend,
    preset: runScenario,
    stopRoleplay: () => setRoleplay(null),
  }
  const implRef = useRef(impl)
  implRef.current = impl
  const [actions] = useState<FeedActions & { send: (t: string) => boolean; preset: (p: string) => void; stopRoleplay: () => void }>(
    () => ({
      task: (t) => implRef.current.task(t),
      practice: (pack, brief) => implRef.current.practice(pack, brief),
      call: (s?: string) => implRef.current.call(s),
      done: (id) => implRef.current.done(id),
      send: (t) => implRef.current.send(t),
      preset: (p) => void implRef.current.preset(p),
      stopRoleplay: () => implRef.current.stopRoleplay(),
    }),
  )

  return (
    // -mb cancels <main>'s page bottom padding so the dock's natural flow
    // position is the page end — at max scroll it stays flush on the tab bar
    // instead of lifting off and exposing a bare strip.
    <div className="mx-auto -mb-24 flex min-h-[calc(100dvh-126px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-[720px] flex-col md:-mb-16">
      {/* progress spine — pinned FLUSH under the app header (§7). The scrim is
          a full-bleed gradient + blur veil (part of this card's glass
          allowance): scrolling messages only ever pass under one unified
          blur layer — never raw through corner notches or a seam. */}
      <div className="sticky top-[calc(54px+env(safe-area-inset-top))] z-20">
        <div className="progress-scrim pointer-events-none absolute -inset-x-4 -top-4 -bottom-3 md:-inset-x-6" aria-hidden="true" />
        <div className="relative pt-1">
          <ProgressCard />
        </div>
      </div>

      {/* message feed — bottom-anchored (justify-end): a short history sits
          just above the dock, like every messenger. The dock is IN-FLOW right
          below this feed, so the bottom padding only needs to cover the
          dock's sticky lift at max scroll (tab-bar clearance, 56px) + air. */}
      <div className="flex flex-1 flex-col justify-end pb-16 pt-4 md:pb-6">
        <MessageFeed entries={entries} state={state} lesson={lessonCtx} actions={actions} />
        {onboarding && (
          <div className="mt-2.5">
            <Onboarding
              stats={stats}
              lesson={lessonCtx}
              append={(role, text) => push({ role, kind: 'text', payload: text })}
              onDone={() => setOnboarding(false)}
            />
          </div>
        )}
        {busy && (
          <div className="mt-2.5 flex">
            <div className="bubble-ai bubble-tail flex items-center gap-1" style={{ padding: '11px 13px' }}>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={endRef} className="scroll-mb-40 md:scroll-mb-28" />
      </div>

      <Composer
        busy={busy}
        aiOn={features.ai}
        scenarioMode={scenarioMode}
        roleplay={roleplay}
        onSend={actions.send}
        onPreset={actions.preset}
        onCall={actions.call}
        onScenarioMode={setScenarioMode}
        onStopRoleplay={actions.stopRoleplay}
      />

      <CallSheet open={callOpen} onOpenChange={setCallOpen} lesson={lessonCtx} scenario={callScenario} />
    </div>
  )
}
