import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Check, Info, Flame, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastTone = 'default' | 'success' | 'streak' | 'error'

interface ToastItem {
  id: number
  title: string
  description?: string
  tone: ToastTone
  leaving?: boolean // exit animation is playing; removed after it finishes
}

interface ToastCtx {
  toast: (t: { title: string; description?: string; tone?: ToastTone; duration?: number }) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const seq = useRef(0)

  // Two-phase dismiss: mark leaving (plays animate-out), then remove.
  const dismiss = useCallback((id: number) => {
    const t = timers.current[id]
    if (t) {
      clearTimeout(t)
      delete timers.current[id]
    }
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 170)
  }, [])

  const toast = useCallback<ToastCtx['toast']>(
    ({ title, description, tone = 'default', duration = 2800 }) => {
      const id = ++seq.current
      setItems((xs) => [...xs.slice(-3), { id, title, description, tone }])
      timers.current[id] = setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach(clearTimeout)
  }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-[100] flex flex-col items-center gap-2 px-3">
        {items.map((it) => (
          <ToastCard key={it.id} item={it} onClose={() => dismiss(it.id)} />
        ))}
      </div>
    </Ctx.Provider>
  )
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const icon =
    item.tone === 'success' ? (
      <Check size={16} className="text-fg" />
    ) : item.tone === 'streak' ? (
      <Flame size={16} className="text-red" />
    ) : item.tone === 'error' ? (
      <X size={16} className="text-red" />
    ) : (
      <Info size={16} className="text-fg-muted" />
    )
  // Auto-dismisses in 2.8s; the whole card is the (optional) dismiss target —
  // no dedicated X for a message that removes itself.
  return (
    <button
      role="status"
      onClick={onClose}
      className={cn(
        'press pointer-events-auto flex w-full max-w-[380px] items-start gap-2.5 rounded-xl border bg-elevated px-3.5 py-3 text-left shadow-[var(--shadow-popover)]',
        item.leaving ? 'animate-out' : 'animate-in-up',
        item.tone === 'error' || item.tone === 'streak' ? 'border-red/40' : 'border-border-strong',
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-fg">{item.title}</div>
        {item.description && <div className="mt-0.5 text-sm text-fg-muted">{item.description}</div>}
      </div>
    </button>
  )
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
