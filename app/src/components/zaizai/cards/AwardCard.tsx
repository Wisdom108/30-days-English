import { Award, PhoneCall } from 'lucide-react'
import type { AwardCardPayload } from '../../../lib/zaizai'

// 到账卡:赚到的通话秒数(+mm:ss)或新徽章,slam 到账动效。
// BADGES 真源在 worker/src/wallet.ts;此处只做展示名映射(与 Me.tsx 同款镜像)。
const BADGE_NAMES: Record<string, string> = {
  first_call: '初通电话',
  streak_7: '七日不断',
  scenario_3: '场景新手',
  scenario_10: '场景老手',
  day_10: '生存毕业',
  day_20: '生活自如',
  day_30: '出师',
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function AwardCard({ data }: { data: AwardCardPayload }) {
  const badge = data.badge ? BADGE_NAMES[data.badge] || data.badge : null
  return (
    <div className="animate-slam card-solid inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5">
      {badge ? (
        <>
          <Award size={17} className="shrink-0 text-warning" />
          <span className="text-body font-medium text-fg">新徽章 · {badge}</span>
        </>
      ) : (
        <>
          <PhoneCall size={16} className="shrink-0 text-success" />
          <span className="text-[22px] font-semibold leading-none text-success">
            <span className="t-tab">+</span>
            {mmss(data.seconds || 0)
              .split(':')
              .map((part, i) => (
                <span key={i}>
                  {i > 0 && <span className="t-tab">:</span>}
                  <span className="t-doto">{part}</span>
                </span>
              ))}
          </span>
          <span className="text-meta text-fg-muted">通话时长到账</span>
        </>
      )}
    </div>
  )
}
