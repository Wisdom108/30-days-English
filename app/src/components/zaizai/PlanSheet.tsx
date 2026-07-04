import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Check, Crown, Package, Sprout, Ticket } from 'lucide-react'
import { paymentAvailable } from '../../lib/caps'
import { openAccount } from '../ai'
import { Button, Sheet } from '../ui'
import { cn } from '../../lib/utils'

// 方案对比 (§8.4) — 免费 / 会员 / 课程包 三层可视。全局单例,挂在 ai.tsx 的
// AuthControls 里(AccountSheet 旁边),任何页面 openPlans() 都能唤起。
// 触发点:Grok 429 额度不足、Me 会员卡对比入口。

/** Ask the globally-mounted PlanSheet to open. */
export const openPlans = () => window.dispatchEvent(new Event('open-plans'))

function Plan({
  icon,
  name,
  note,
  items,
  highlight,
  children,
}: {
  icon: ReactNode
  name: string
  note: string
  items: string[]
  highlight?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col rounded-xl border p-4', highlight ? 'border-border-strong bg-surface shadow-rest' : 'border-border-soft bg-surface-2')}>
      <div className="flex items-center gap-1.5 text-body-lg font-semibold text-fg">{icon}{name}</div>
      <p className="mt-0.5 text-meta text-fg-muted">{note}</p>
      <ul className="mt-2.5 flex-1 space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-1.5 text-sm text-fg-secondary">
            <Check size={13} className="shrink-0 text-success" /> {it}
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  )
}

export default function PlanSheet() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener('open-plans', on)
    return () => window.removeEventListener('open-plans', on)
  }, [])

  // 关掉自己再跳转/开 AccountSheet,避免两层 Sheet 叠着。
  const go = (fn: () => void) => { setOpen(false); fn() }

  return (
    <Sheet open={open} onOpenChange={setOpen} side="bottom" title="方案对比">
      <div className="grid gap-3 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:grid-cols-3">
        <Plan icon={<Sprout size={16} className="text-success" />} name="免费" note="每天都能开口" items={['每日体验额度', '完成练习赚通话时长']}>
          <Button variant="secondary" className="w-full" onClick={() => go(() => nav('/course'))}>
            <BookOpen size={14} /> 去学习赚时长
          </Button>
        </Plan>

        <Plan highlight icon={<Crown size={16} className="text-warning" />} name="会员" note="放开手脚练" items={['AI 额度放开', '进度云同步']}>
          <Button className="w-full" onClick={() => go(openAccount)}>
            <Ticket size={14} /> 输入激活码
          </Button>
          {paymentAvailable() && (
            <Button variant="secondary" className="w-full" onClick={() => go(openAccount)}>订阅</Button>
          )}
        </Plan>

        <Plan icon={<Package size={16} className="text-fg-muted" />} name="课程包" note="进阶专项,正在打磨" items={['敬请期待']}>
          <Button variant="secondary" className="w-full" disabled>敬请期待</Button>
        </Plan>
      </div>
    </Sheet>
  )
}
