import { MessageCircleQuestion, PenLine } from 'lucide-react'
import { AiPartner } from './blocks/SpeakingBlock'
import { getLesson, TOTAL_DAYS } from '../data/curriculum'
import { useApp } from '../state'
import type { LessonCtx } from '../lib/ai'

// Dedicated AI hub — makes the AI speaking partner a first-class destination
// instead of a buried accordion inside one lesson tab. The realtime voice tutor
// is the star of the page.
export default function AiHub() {
  const { state } = useApp()
  const day = Math.min(state.currentDay, TOTAL_DAYS)
  const lesson = getLesson(day)
  const ctx: LessonCtx = lesson
    ? { day: lesson.day, theme: lesson.theme, title_en: lesson.title_en, grammar: lesson.grammarNote?.point_en, level: 'A2-B1' }
    : {}

  return (
    <div className="space-y-5">
      {/* artful hero — hand-drawn voice, paper card */}
      <header className="hero-card animate-in-up overflow-hidden rounded-xl border border-border-strong px-6 py-7 text-center">
        <div className="label-nd mb-3 flex items-center justify-center gap-1.5">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" /> AI SPEAKING PARTNER
        </div>
        <h1 className="font-hand text-[42px] leading-[1.02] text-fg">开口，才是真的会</h1>
        <p className="mx-auto mt-2.5 max-w-sm text-body text-fg-muted">
          和 AI 老师 <span className="ink-underline">实时语音对话</span>，能随时打断、边说边纠错 —— 像和朋友聊天一样练英语。
        </p>
      </header>

      {/* the star: the realtime voice partner (free CF / paid Grok) */}
      <section className="animate-in-up rounded-xl border border-border bg-surface p-4" style={{ animationDelay: '60ms' }}>
        <AiPartner lesson={ctx} />
      </section>

      {/* other AI tools */}
      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={() => window.dispatchEvent(new Event('open-tutor'))}
          className="press wiggle hand-frame-soft bg-surface p-4 text-left"
        >
          <MessageCircleQuestion className="mb-2 text-fg" size={22} />
          <div className="text-h3 font-semibold text-fg">问 AI 私教</div>
          <div className="mt-0.5 text-meta text-fg-muted">语法 · 用法 · 为什么这么说</div>
        </button>
        <div className="hand-frame-soft bg-surface p-4">
          <PenLine className="mb-2 text-fg" size={22} />
          <div className="text-h3 font-semibold text-fg">AI 批改写作</div>
          <div className="mt-0.5 text-meta text-fg-muted">在每天的「写作」里让 AI 打分纠错</div>
        </div>
      </section>
    </div>
  )
}
