import { useState } from 'react'
import { AlertCircle, Loader2, Mic, Sparkles } from 'lucide-react'
import type { DayLesson } from '../types'
import type { LessonCtx } from '../lib/ai'
import { aiRetell, AIError } from '../lib/ai'
import { recorderErrorMessage, useRecorder } from '../lib/useRecorder'
import { SpeakButton } from './shared'
import { Button, Callout, Collapse } from './ui'
import { cn } from '../lib/utils'

// 复述环节：听懂 → 用自己的话说出来，闭掉「听说闭环」的最后一环。
// Record → ASR transcript → /ai/retell judges CONTENT coverage against the
// lesson script (not pronunciation — that's the shadowing block's job).
export default function RetellPanel({ lesson, onRoundDone }: { lesson: DayLesson; onRoundDone?: () => void }) {
  const { rec, cfPath, canRecord, isBusy, take } = useRecorder()
  const script = lesson.listening.script
  const ctx: LessonCtx = { day: lesson.day, theme: lesson.theme, title_en: lesson.title_en, grammar: lesson.grammarNote?.point_en, level: 'A2-B1' }

  const [said, setSaid] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const record = async () => {
    if (isBusy()) {
      take() // tap-to-stop / double-tap swallow
      return
    }
    setSaid(null)
    setFeedback(null)
    setError(null)
    try {
      const t = await take()
      if (!t) return
      setSaid(t)
      setBusy(true)
      try {
        const { reply } = await aiRetell(t, script, ctx)
        setFeedback(reply)
      } catch (e) {
        // Transcript landed but the coach didn't — the round still counts.
        setFeedback(e instanceof AIError ? `(在在暂时点评不了:${e.message})` : '(在在暂时点评不了,稍后再试)')
      } finally {
        setBusy(false)
      }
    } catch (e) {
      setError(recorderErrorMessage(e))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed text-fg-secondary">
          先听一遍，再<span className="font-semibold text-fg">用自己的话</span>把内容讲出来（英文，两三句就好）。不用背原文——说出大意就是赢。
        </p>
        <SpeakButton text={script} />
      </div>

      <Collapse label="原文" hint={script.slice(0, 32)}>
        <p className="whitespace-pre-wrap p-4 text-body leading-relaxed text-fg-secondary">{script}</p>
      </Collapse>

      <div className="flex items-center gap-3">
        <div className="relative h-11 w-11 shrink-0">
          {rec && <span className="pulse-red absolute -inset-1.5 rounded-full border border-red/40" />}
          <button
            onClick={record}
            disabled={!canRecord || (rec && !cfPath)}
            aria-label={rec ? (cfPath ? '结束录音' : '录音中') : '开始复述'}
            className={cn(
              'press absolute inset-0 grid place-items-center rounded-full border transition-colors disabled:opacity-45',
              rec ? 'border-red bg-red-soft text-red' : 'border-border-strong bg-surface text-fg hover:border-fg',
            )}
          >
            {rec ? <span className="pulse-red h-4 w-4 rounded-full bg-red" /> : <Mic size={18} />}
          </button>
        </div>
        <span className="label-nd">
          {!canRecord ? '此浏览器不支持录音 · 建议 Chrome/Edge' : rec ? (cfPath ? '说吧… 点击结束' : '说吧…') : said ? '再来一遍也行' : '点麦克风开始复述'}
        </span>
      </div>

      {said && <div className="animate-in-up text-sm leading-relaxed text-fg-muted">你说的：{said}</div>}
      {busy && (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 size={14} className="animate-spin" /> 在在听完了，正在点评…
        </div>
      )}
      {feedback && (
        <Callout tone="accent" className="animate-in-up" icon={<Sparkles size={14} className="text-fg-muted" />}>
          <span className="whitespace-pre-wrap">{feedback}</span>
        </Callout>
      )}
      {error && (
        <Callout tone="red" role="alert" icon={<AlertCircle size={16} className="text-red" />}>
          {error}
        </Callout>
      )}

      {feedback && onRoundDone && (
        <Button className="w-full" onClick={onRoundDone}>
          完成本轮回炉
        </Button>
      )}
    </div>
  )
}
