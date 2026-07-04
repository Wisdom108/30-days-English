import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Check, ChevronRight, Mic, Sparkles, X } from 'lucide-react'
import { useApp } from '../../state'
import { useAuth } from '../../auth'
import { features } from '../../config'
import { getLesson, TOTAL_DAYS } from '../../data/curriculum'
import { dueCards } from '../../lib/srs'
import { displayStreak, getDayProgress } from '../../lib/storage'
import { BLOCKS } from '../../blocks'
import { aiChat, AIError, type ChatMsg, type LessonCtx } from '../../lib/ai'
import {
  briefShownToday,
  genScenario,
  loadChat,
  localMemoryText,
  markBriefShown,
  newId,
  nextScenarioRef,
  postEarn,
  pushLocalMemory,
  saveChat,
  zaizaiBrief,
  zaizaiChat,
  type ChatEntry,
  type ScenarioPack,
  type TaskCardPayload,
  type ZaizaiStats,
} from '../../lib/zaizai'
import { openAccount } from '../ai'
import { BlockIcon } from '../blockicons'
import { useToast } from '../ui/toast'
import ProgressCard from './ProgressCard'
import ScenarioCard from './ScenarioCard'
import CallSheet from './CallSheet'
import { cn } from '../../lib/utils'

const PRESETS = ['机场', '点餐', '打车', '酒店', '问路', '购物']

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

  const [entries, setEntries] = useState<ChatEntry[]>(() => loadChat())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [scenarioMode, setScenarioMode] = useState(false)
  const [roleplay, setRoleplay] = useState<string | null>(null)
  const [callOpen, setCallOpen] = useState(false)
  const [callScenario, setCallScenario] = useState<string | undefined>(undefined)

  useEffect(() => saveChat(entries), [entries])

  const push = (e: Omit<ChatEntry, 'id' | 'at'>) =>
    setEntries((es) => [...es, { ...e, id: newId(), at: Date.now() }])

  // Guests carry their own local notes; account users get D1 memories server-side.
  const guestMemory = () => (user?.account ? undefined : localMemoryText() || undefined)

  // ---- morning dispatch: once per LOCAL day — brief (or static greeting) + task cards
  const bootRef = useRef(false)
  useEffect(() => {
    if (loading || bootRef.current || briefShownToday()) return
    bootRef.current = true
    markBriefShown()
    const tasks: ChatEntry[] = BLOCKS.filter((b) => !prog.completedBlocks[b.key]).map((b) => ({
      id: newId(),
      role: 'assistant',
      kind: 'task-card',
      payload: { day: current, key: b.key, title_zh: b.title_zh, minutes: b.minutes },
      at: Date.now(),
    }))
    const fallback =
      `早!今天是 Day ${current}/30${stats.streak > 0 ? `,已经连着学了 ${stats.streak} 天` : ''}。` +
      (tasks.length ? '今天的练习清单在下面,先挑一块开始?' : '今天的 5 块练习都完成了,来聊两句或练个场景?')
    const finish = (text: string, kind: 'brief' | 'text') =>
      setEntries((es) => [...es, { id: newId(), role: 'assistant', kind, payload: text, at: Date.now() }, ...tasks])
    if (features.ai && user) {
      setBusy(true)
      zaizaiBrief(stats, lessonCtx, guestMemory())
        .then(({ reply }) => finish(reply, 'brief'))
        .catch(() => finish(fallback, 'text'))
        .finally(() => setBusy(false))
    } else {
      finish(fallback, 'text')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

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
        .filter((e) => typeof e.payload === 'string' && e.kind !== 'task-card' && e.kind !== 'scenario-pack')
        .slice(-8)
        .map((e) => ({ role: e.role, content: e.payload as string }))
      const { reply } = roleplay
        ? await aiChat(history, lessonCtx, roleplay)
        : await zaizaiChat(history, lessonCtx, stats, guestMemory())
      push({ role: 'assistant', kind: 'text', payload: reply })
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

  const finishScenario = () => {
    setRoleplay(null)
    if (user?.account) {
      postEarn('scenario_complete', nextScenarioRef()).then((r) =>
        r && r.earned > 0
          ? toast({ title: `场景完成 · 赚到 ${Math.floor(r.earned / 60)} 分钟通话`, tone: 'success' })
          : toast({ title: '场景完成', tone: 'success' }),
      )
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
          <ScenarioCard pack={pack} onPractice={(s) => startPractice(pack, s)} onCall={startCall} onDone={finishScenario} />
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

      {/* message feed */}
      <div className="flex-1 space-y-2.5 py-4">
        {entries.map(renderEntry)}
        {busy && (
          <div className="flex">
            <div className="bubble-ai flex items-center gap-1 px-3.5 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
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
