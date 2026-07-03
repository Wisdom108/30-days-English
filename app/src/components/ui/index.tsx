import { cva, type VariantProps } from 'class-variance-authority'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '../../lib/utils'

// Shared scrim for all overlays (single source so they can't drift).
export const SCRIM =
  'fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in-up data-[state=closed]:animate-out'
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

// ============================================================================
// Button
// ============================================================================
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 select-none active:scale-[0.985] disabled:opacity-45 disabled:pointer-events-none',
    RING,
  ),
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-fg hover:bg-brand-hover shadow-rest',
        secondary: 'bg-surface text-fg border border-border hover:bg-hover hover:border-border-strong',
        ghost: 'text-fg-secondary hover:text-fg hover:bg-hover',
        soft: 'bg-accent-soft text-fg hover:brightness-[1.4]',
        danger: 'bg-danger-soft text-danger border border-danger/30 hover:border-danger/60',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-body',
        lg: 'h-11 px-5 text-body-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})

// ---- Icon-only button — 44px tap target by default (mobile min) ----
export function IconButton({
  className,
  label,
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-12 w-12' : 'h-11 w-11'
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'press inline-grid place-items-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-45 disabled:pointer-events-none',
        RING,
        dim,
        className,
      )}
      {...props}
    />
  )
}

// ============================================================================
// Card + telemetry header + sharp inner segment
// ============================================================================
/** Card. Static by default — `interactive` opts in the hover affordance so only
 *  genuinely clickable surfaces light up. */
export function Card({
  className,
  children,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface shadow-card',
        interactive && 'cursor-pointer transition-colors duration-200 hover:border-border-strong',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Telemetry-style card header: mono uppercase title + optional right slot + hairline. */
export function CardHead({
  title,
  right,
  className,
}: {
  title: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between border-b border-border px-[18px] py-4', className)}>
      <div className="label-nd">{title}</div>
      {right && <div className="flex items-center gap-2.5">{right}</div>}
    </div>
  )
}

/** Sharp-cornered inset container (rows divided by hairlines). The "hard core". */
export function Segment({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('overflow-hidden rounded-sm border border-border bg-surface-2', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('label-nd mt-6 mb-2 first:mt-0', className)}>{children}</div>
}

// ---- Collapse — THE one fold pattern (animated grid-rows, chevron header) ----
export function Collapse({
  label,
  count,
  hint,
  defaultOpen,
  children,
  className,
}: {
  label: string
  count?: number
  hint?: string // one-line muted preview so the closed state isn't opaque
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Children stay MOUNTED when closed (so e.g. the AI chat keeps its state), but
  // `inert` pulls the zero-height content out of the tab order + AT tree so you
  // can't Tab into invisible controls.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (open) el.removeAttribute('inert')
    else el.setAttribute('inert', '')
  }, [open])
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border', className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn('press flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-hover', RING)}
      >
        <span className="min-w-0">
          <span className="label-nd">
            {label}
            {count != null && <> · <span className="t-tab text-fg-secondary">{count}</span></>}
          </span>
          {hint && !open && <span className="mt-0.5 block truncate text-sm text-fg-muted">{hint}</span>}
        </span>
        <ChevronDown size={17} className={cn('shrink-0 text-fg-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div
        className={cn('grid transition-[grid-template-rows] duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
      >
        <div ref={bodyRef} className="overflow-hidden">
          <div className="border-t border-border">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Badge
// ============================================================================
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-label uppercase tracking-[0.12em]',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-2 text-fg-secondary',
        accent: 'border-border-strong bg-surface-2 text-fg',
        success: 'border-border-strong bg-surface-2 text-fg',
        warning: 'border-border bg-surface-2 text-fg-muted',
        red: 'border-red/40 bg-red-soft text-red',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  children,
  style,
}: { className?: string; children: ReactNode; style?: React.CSSProperties } & VariantProps<
  typeof badgeVariants
>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} style={style}>
      {children}
    </span>
  )
}

// ---- Kbd (keyboard hint) ----
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-sm border border-border-strong bg-surface-2 px-1 font-mono text-label text-fg-secondary">
      {children}
    </kbd>
  )
}

// ============================================================================
// Progress (solid single-color bar)
// ============================================================================
export function Progress({
  value,
  color = 'var(--color-brand)',
  className,
}: {
  value: number
  color?: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full border border-border bg-surface-2', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-[240ms]"
        style={{
          width: `${pct}%`,
          background: color,
          transitionTimingFunction: 'var(--ease-out)', // no bounce: bars are instruments
        }}
      />
    </div>
  )
}

// ---- Cells — segmented block bar (the nullframe signature data viz) ----
// A row of small square cells; `value` of `max` are filled. Reads as a device
// readout, not a smooth progress bar.
export function Cells({
  value,
  max,
  accent = 'var(--color-fg)',
  className,
  height = 10,
}: {
  value: number
  max: number
  accent?: string
  className?: string
  height?: number
}) {
  const filled = Math.max(0, Math.min(max, Math.round(value)))
  return (
    <div
      className={cn('flex gap-[3px]', className)}
      role="progressbar"
      aria-valuenow={filled}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`${filled}/${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1.5px] transition-colors duration-200"
          style={{
            height,
            background: i < filled ? accent : 'var(--color-border-strong)',
            opacity: i < filled ? 1 : 0.5,
            transitionDelay: `${i * 20}ms`, // FILL primitive: segments light left→right
          }}
        />
      ))}
    </div>
  )
}

// ============================================================================
// Callout (left accent bar + soft bg)
// ============================================================================
export function Callout({
  tone = 'accent',
  icon,
  children,
  className,
  role,
}: {
  tone?: 'accent' | 'warning' | 'red'
  icon?: ReactNode
  children: ReactNode
  className?: string
  role?: string
}) {
  const styles =
    tone === 'warning'
      ? { bar: 'var(--color-fg-muted)', bg: 'var(--color-surface-2)' }
      : tone === 'red'
      ? { bar: 'var(--color-red)', bg: 'var(--color-red-soft)' }
      : { bar: 'var(--color-fg)', bg: 'var(--color-accent-soft)' }
  return (
    <div
      role={role}
      className={cn('flex gap-3 rounded-lg p-4', className)}
      style={{ background: styles.bg, boxShadow: `inset 3px 0 0 0 ${styles.bar}` }}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="text-sm leading-relaxed text-fg">{children}</div>
    </div>
  )
}

// ============================================================================
// Inputs — 44px tap targets, unified focus ring
// ============================================================================
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-body text-fg outline-none transition-shadow placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/30',
          className,
        )}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full resize-y rounded-lg border border-border bg-surface p-3.5 text-body text-fg outline-none transition-shadow placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/30',
          className,
        )}
        {...props}
      />
    )
  },
)

// ---- Stepper — THE one prev/next pattern (chevron squares + bar dots) ----
export function Stepper({
  idx,
  total,
  onStep,
  className,
}: {
  idx: number
  total: number
  onStep: (delta: number) => void
  className?: string
}) {
  const btn = cn(
    'press grid h-10 w-10 place-items-center rounded-lg border border-border text-fg-secondary transition-colors hover:text-fg disabled:opacity-35',
    RING,
  )
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <button onClick={() => onStep(-1)} disabled={idx === 0} aria-label="上一个" className={btn}>
        <ChevronLeft size={17} />
      </button>
      <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5 px-3">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('h-1.5 rounded-[2px] transition-all duration-200', i === idx ? 'w-4 bg-fg' : 'w-1.5 bg-border-strong')} />
        ))}
      </div>
      <button onClick={() => onStep(1)} disabled={idx === total - 1} aria-label="下一个" className={btn}>
        <ChevronRight size={17} />
      </button>
    </div>
  )
}

// ============================================================================
// Select (Radix) — replaces native <select>
// ============================================================================
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: {
  value: T
  onValueChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  ariaLabel?: string
  className?: string
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-11 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3.5 text-body text-fg outline-none transition-colors hover:bg-hover',
          RING,
          className,
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown size={15} className="text-fg-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 overflow-hidden rounded-lg border border-border bg-elevated shadow-[var(--shadow-popover)] data-[state=open]:animate-in-up data-[state=closed]:animate-out"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex h-9 cursor-pointer select-none items-center rounded-sm pl-7 pr-3 text-body text-fg-secondary outline-none data-[highlighted]:bg-hover data-[highlighted]:text-fg data-[state=checked]:text-fg"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2">
                  <Check size={13} />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

// ============================================================================
// Sheet (Radix Dialog) — slide-in panel; replaces hand-rolled drawers
// ============================================================================
export function Sheet({
  open,
  onOpenChange,
  side = 'left',
  title,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  side?: 'left' | 'right' | 'bottom'
  title?: string
  children: ReactNode
  className?: string
}) {
  const pos =
    side === 'left'
      ? 'inset-y-0 left-0 h-full w-[280px] border-r rounded-r-xl data-[state=open]:animate-in-up data-[state=closed]:animate-out'
      : side === 'right'
      ? 'inset-y-0 right-0 h-full w-[420px] max-w-[92vw] border-l rounded-l-xl data-[state=open]:animate-in-up data-[state=closed]:animate-out'
      : // bottom sheet slides from its edge (mobile); desktop side-panel fades
        'sheet-in-bottom inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-xl border-t md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-[420px] md:rounded-t-none md:rounded-l-xl md:border-l md:border-t-0'
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 border-border bg-surface shadow-[var(--shadow-popover)] focus:outline-none',
            pos,
            className,
          )}
        >
          {title && (
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <DialogPrimitive.Title className="label-nd">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <IconButton label="关闭"><X size={16} /></IconButton>
              </DialogPrimitive.Close>
            </div>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ============================================================================
// Empty state
// ============================================================================
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto max-w-[420px] py-16 text-center', className)}>
      {icon && (
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl border border-border bg-surface-2 text-fg-muted">
          {icon}
        </div>
      )}
      <h2 className="text-h2 font-semibold text-fg">{title}</h2>
      {description && <p className="mt-2 text-body text-fg-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

// ---- Skeleton (loading placeholder) ----
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-hover', className)} />
}

// ============================================================================
// Tooltip (Radix) — dark chip, readable
// ============================================================================
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-[240px] rounded-md border border-border-strong bg-elevated px-2.5 py-1.5 text-meta text-fg shadow-[var(--shadow-popover)] data-[state=delayed-open]:animate-in-up"
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-[var(--color-border-strong)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

// ============================================================================
// Confirm dialog (AlertDialog) — replaces native confirm()
// ============================================================================
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialogPrimitive.Root>
      <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={SCRIM} />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-popover)] data-[state=open]:animate-in-up data-[state=closed]:animate-out">
          <AlertDialogPrimitive.Title className="text-h2 font-semibold text-fg">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-fg-secondary">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2.5">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary" size="sm">{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant={destructive ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
