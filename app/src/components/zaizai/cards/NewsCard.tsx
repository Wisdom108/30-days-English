import { Newspaper } from 'lucide-react'
import { speak, speakPassage } from '../../../lib/speech'
import type { NewsCardPayload } from '../../../lib/zaizai'

// 每日新闻卡:标题 + 难度 chip + 简化摘要(点读)+ 生词 chips(点发音)+ 来源行。
export default function NewsCard({ data }: { data: NewsCardPayload }) {
  return (
    <div className="card-solid w-full max-w-[88%] rounded-xl p-4">
      <div className="flex items-center gap-2">
        <Newspaper size={14} className="shrink-0 text-fg-muted" />
        <span className="label-nd">每日新闻</span>
        {data.level && (
          <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-brand">{data.level}</span>
        )}
      </div>
      <div className="mt-2 text-h3 font-semibold leading-snug text-fg">{data.title}</div>
      {data.summary_en && (
        <button
          onClick={() => speakPassage(data.summary_en)}
          className="press mt-1.5 block w-full text-left text-body leading-relaxed text-fg-secondary"
        >
          {data.summary_en}
        </button>
      )}
      {data.glossary.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.glossary.map((g) => (
            <button key={g.word} onClick={() => speak(g.word)} className="press rounded-full border border-border bg-surface px-2.5 py-1 text-left">
              <span className="text-sm font-medium text-fg">{g.word}</span>
              <span className="ml-1.5 text-meta text-fg-muted">{g.zh}</span>
            </button>
          ))}
        </div>
      )}
      {data.source && <div className="mt-3 text-meta text-fg-dim">来源 · {data.source}</div>}
    </div>
  )
}
