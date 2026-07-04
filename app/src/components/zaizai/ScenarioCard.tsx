import { Check, MessageSquare, PhoneCall, Volume2 } from 'lucide-react'
import { speak } from '../../lib/speech'
import { Button } from '../ui'
import type { ScenarioPack } from '../../lib/zaizai'

// 场景包玻璃卡:关键句可点发音,生词带 IPA,三个动作按钮。
// The props interface is the cross-agent contract; keep it EXACTLY.
export interface ScenarioCardProps {
  pack: ScenarioPack
  onPractice: (scenario: string) => void
  onCall: (scenario: string) => void
  onDone: () => void
}

/** Fold the pack into a ≤380-char English roleplay brief (role + opener +
 *  phrase list). Leads with `title_zh — ` so ChatHome's roleplay chip
 *  (`split(' — ')[0]`) shows the Chinese title. */
function packToBrief(pack: ScenarioPack): string {
  const phrases = pack.phrases.map((p) => p.en).join(' / ')
  return `${pack.title_zh} — Roleplay: you are ${pack.role_zh}. Open with "${pack.opener_en}". Learner practices: ${phrases}`.slice(0, 380)
}

export default function ScenarioCard({ pack, onPractice, onCall, onDone }: ScenarioCardProps) {
  const brief = packToBrief(pack)
  // ChatHome stamps `done` onto the persisted pack after 完成 — no re-claim farming.
  const done = !!(pack as ScenarioPack & { done?: boolean }).done
  return (
    <div className="glass w-full max-w-[88%] rounded-xl p-4">
      <div className="text-h3 font-semibold text-fg">{pack.title_zh}</div>
      <div className="mt-0.5 text-meta text-fg-muted">对方角色 · {pack.role_zh}</div>

      {/* 开场白 — 点一下听 */}
      <button onClick={() => speak(pack.opener_en)} className="press mt-3 block w-full text-left">
        <span className="text-body italic leading-snug text-fg-secondary">“{pack.opener_en}”</span>
      </button>

      {/* 关键句 — 点英文发音,中文字幕 */}
      <ul className="mt-3 space-y-2">
        {pack.phrases.map((p) => (
          <li key={p.en}>
            <button onClick={() => speak(p.en)} className="press group flex w-full items-start gap-2 text-left">
              <Volume2 size={13} className="mt-1 shrink-0 text-fg-dim transition-colors group-hover:text-brand" />
              <span className="min-w-0">
                <span className="block text-body leading-snug text-fg">{p.en}</span>
                <span className="block text-meta text-fg-muted">{p.zh}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* 生词 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pack.words.map((w) => (
          <button key={w.word} onClick={() => speak(w.word)} className="press rounded-full border border-border bg-surface px-2.5 py-1 text-left">
            <span className="text-sm font-medium text-fg">{w.word}</span>
            <span className="t-ipa ml-1.5 text-meta text-fg-muted">{w.ipa}</span>
            <span className="ml-1.5 text-meta text-fg-muted">{w.zh}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onPractice(brief)}><MessageSquare size={13} /> 文字演练</Button>
        <Button size="sm" onClick={() => onCall(brief)}><PhoneCall size={13} /> 实战电话</Button>
        <Button size="sm" variant="ghost" disabled={done} onClick={onDone}><Check size={13} /> {done ? '已完成' : '完成'}</Button>
      </div>
    </div>
  )
}
