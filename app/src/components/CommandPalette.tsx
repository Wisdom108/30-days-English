import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import {
  Home, BookOpen, RotateCcw, TrendingUp, Sparkles, Crosshair, Zap, CornerDownLeft, Search,
} from 'lucide-react'
import { TOTAL_DAYS } from '../data/curriculum'
import { cn } from '../lib/utils'

export interface Cmd {
  id: string
  label: string
  hint?: string
  group: string
  icon: React.ReactNode
  keywords?: string
  run: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  current,
  due,
  toggleFocus,
  toggleMotion,
  openTutor,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  current: number
  due: number
  toggleFocus: () => void
  toggleMotion: () => void
  openTutor: () => void
}) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const close = () => onOpenChange(false)
  const go = (fn: () => void) => () => { close(); fn() }

  const cmds = useMemo<Cmd[]>(() => {
    const base: Cmd[] = [
      { id: 'today', group: 'JUMP', icon: <BookOpen size={16} />, label: `进入 Day ${current} · 今日任务`, hint: '↵', run: go(() => nav(`/day/${current}`)) },
      { id: 'review', group: 'JUMP', icon: <RotateCcw size={16} />, label: `复习到期词卡${due ? ` · ${due} 张` : ''}`, hint: 'R', keywords: 'review srs 复习', run: go(() => nav('/review')) },
      { id: 'progress', group: 'JUMP', icon: <TrendingUp size={16} />, label: '学习进度', hint: 'P', keywords: 'progress stats 进度', run: go(() => nav('/progress')) },
      { id: 'home', group: 'JUMP', icon: <Home size={16} />, label: '首页 · Dashboard', hint: 'H', keywords: 'home dashboard 首页', run: go(() => nav('/')) },
      { id: 'ai', group: 'ACTIONS', icon: <Sparkles size={16} />, label: '问 AI 私教', hint: 'A', keywords: 'ai tutor 问', run: go(openTutor) },
      { id: 'focus', group: 'VIEW', icon: <Crosshair size={16} />, label: '进入专注模式', hint: 'F', keywords: 'focus 专注', run: go(toggleFocus) },
      { id: 'motion', group: 'VIEW', icon: <Zap size={16} />, label: '切换动效（省电/减弱）', hint: 'M', keywords: 'motion 动效', run: go(toggleMotion) },
    ]
    // Numeric input → "go to Day N"
    const n = parseInt(q.trim(), 10)
    if (!Number.isNaN(n) && n >= 1 && n <= TOTAL_DAYS) {
      base.unshift({ id: `day-${n}`, group: 'JUMP', icon: <CornerDownLeft size={16} />, label: `跳到 Day ${n}`, hint: '↵', run: go(() => nav(`/day/${n}`)) })
    }
    return base
  }, [q, current, due])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return cmds
    return cmds.filter((c) => (c.label + ' ' + (c.keywords ?? '')).toLowerCase().includes(s) || /^\d+$/.test(s))
  }, [q, cmds])

  useEffect(() => { setSel(0) }, [q, open])
  useEffect(() => { if (open) { setQ('') } }, [open])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run() }
  }

  // group render order
  const groups = ['JUMP', 'ACTIONS', 'VIEW']

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in-up" />
        <Dialog.Content
          onKeyDown={onKey}
          className="fixed left-1/2 top-[13vh] z-[60] w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-border-strong bg-surface shadow-[var(--shadow-popover)] focus:outline-none data-[state=open]:animate-in-up"
        >
          <Dialog.Title className="sr-only">命令面板</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
            <Search size={16} className="text-fg-dim" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="跳转某天 / 复习 / 问 AI / 设置…"
              className="flex-1 bg-transparent text-body-lg text-fg outline-none placeholder:text-fg-dim"
            />
            <span className="label-nd">ESC</span>
          </div>
          <div ref={listRef} className="max-h-[340px] overflow-auto p-2">
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-fg-muted">无匹配命令</div>
            )}
            {groups.map((g) => {
              const items = filtered.filter((c) => c.group === g)
              if (!items.length) return null
              return (
                <div key={g}>
                  <div className="label-nd px-3 pb-1.5 pt-2.5">{g}</div>
                  {items.map((c) => {
                    const gi = filtered.indexOf(c)
                    return (
                      <button
                        key={c.id}
                        onMouseEnter={() => setSel(gi)}
                        onClick={c.run}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                          gi === sel ? 'bg-elevated' : 'hover:bg-hover',
                        )}
                      >
                        <span className="text-fg-secondary">{c.icon}</span>
                        <span className="flex-1 text-body text-fg">{c.label}</span>
                        {c.hint && <span className="rounded-sm border border-border-strong px-1.5 py-0.5 font-mono text-label text-fg-muted">{c.hint}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
