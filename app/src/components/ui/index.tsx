import { cva, type VariantProps } from 'class-variance-authority'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { forwardRef } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

// ============================================================================
// Button
// ============================================================================
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-45 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-fg hover:bg-brand-hover shadow-rest',
        secondary: 'bg-surface text-fg border border-border hover:bg-hover hover:border-border-strong',
        ghost: 'text-fg-secondary hover:text-fg hover:bg-hover',
        soft: 'bg-accent-soft text-brand hover:brightness-[0.97]',
        danger: 'bg-danger-soft text-danger border border-danger/20 hover:brightness-[0.98]',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-4 text-body',
        lg: 'h-11 px-5 text-body-lg',
        icon: 'h-9 w-9',
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

// ---- Icon-only button (square tap target) ----
export function IconButton({
  className,
  label,
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid place-items-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-45 disabled:pointer-events-none',
        dim,
        className,
      )}
      {...props}
    />
  )
}

// ============================================================================
// Card
// ============================================================================
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface shadow-rest', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />
}

export function SectionLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('label-nd mt-6 mb-2 first:mt-0', className)}>{children}</div>
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn('my-4 border-t border-border', className)} />
}

// ============================================================================
// Badge
// ============================================================================
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-label uppercase tracking-[0.1em]',
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
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-sm border border-border-strong bg-surface-2 px-1 font-mono text-[10.5px] text-fg-secondary">
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
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          background: color,
          transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)',
        }}
      />
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
}: {
  tone?: 'accent' | 'warning' | 'red'
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  const styles =
    tone === 'warning'
      ? { bar: 'var(--color-fg-muted)', bg: 'var(--color-surface-2)' }
      : tone === 'red'
      ? { bar: 'var(--color-red)', bg: 'var(--color-red-soft)' }
      : { bar: 'var(--color-fg)', bg: 'var(--color-accent-soft)' }
  return (
    <div
      className={cn('flex gap-2.5 rounded-lg p-3.5', className)}
      style={{ background: styles.bg, boxShadow: `inset 3px 0 0 0 ${styles.bar}` }}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="text-sm leading-relaxed text-fg">{children}</div>
    </div>
  )
}

// ============================================================================
// Inputs
// ============================================================================
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-lg border border-border bg-surface px-3 text-body text-fg outline-none transition-shadow placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/25',
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
          'w-full resize-y rounded-lg border border-border bg-surface p-3.5 text-body text-fg outline-none transition-shadow placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/25',
          className,
        )}
        {...props}
      />
    )
  },
)

// ---- Segmented control (shared tab-switcher primitive) ----
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  const h = size === 'sm' ? 'py-1.5 text-sm' : 'py-2 text-body'
  return (
    <div
      role="tablist"
      className={cn('inline-flex gap-1 rounded-lg border border-border bg-surface-2 p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md px-3 font-medium transition-all duration-200',
              h,
              active ? 'bg-elevated text-fg shadow-rest' : 'text-fg-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        )
      })}
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
          'inline-flex h-9 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-body text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand/40',
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
          className="z-50 overflow-hidden rounded-lg border border-border bg-elevated shadow-[var(--shadow-popover)] data-[state=open]:animate-in-up"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-pointer select-none items-center rounded-md pl-7 pr-3 text-body text-fg-secondary outline-none data-[highlighted]:bg-hover data-[highlighted]:text-fg data-[state=checked]:text-fg"
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
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in-up" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-popover)] data-[state=open]:animate-in-up">
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
