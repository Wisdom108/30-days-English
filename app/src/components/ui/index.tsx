import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { cn } from '../../lib/utils'

// ---- Button ----
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-45 disabled:pointer-events-none select-none',
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
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-4 text-[14px]',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

// ---- Card ----
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[8px] border border-border bg-surface shadow-rest', className)}
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
  return (
    <div
      className={cn(
        'mt-6 mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted first:mt-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ---- Badge ----
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
  {
    variants: {
      variant: {
        default: 'border border-border bg-surface-2 text-fg-secondary',
        accent: 'bg-accent-soft text-brand',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
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

// ---- Progress (solid single-color bar) ----
export function Progress({
  value,
  color = 'var(--color-brand)',
  className,
}: {
  value: number
  color?: string
  className?: string
}) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-border', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
          transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)',
        }}
      />
    </div>
  )
}

// ---- Callout (Notion-style: left accent bar + soft bg) ----
export function Callout({
  tone = 'accent',
  icon,
  children,
  className,
}: {
  tone?: 'accent' | 'warning'
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  const styles =
    tone === 'warning'
      ? { bar: 'var(--color-warning)', bg: 'var(--color-warning-soft)' }
      : { bar: 'var(--color-brand)', bg: 'var(--color-accent-soft)' }
  return (
    <div
      className={cn('flex gap-2.5 rounded-[8px] p-3.5', className)}
      style={{ background: styles.bg, boxShadow: `inset 3px 0 0 0 ${styles.bar}` }}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="text-[13px] leading-relaxed text-fg">{children}</div>
    </div>
  )
}

// ---- Tooltip (Radix) ----
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 rounded-md border border-border bg-fg px-2 py-1 text-[12px] text-white shadow-[var(--shadow-popover)] data-[state=delayed-open]:animate-in-up"
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-[#37352f]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

// ---- Confirm dialog (AlertDialog) — replaces native confirm() ----
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
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[1px] data-[state=open]:animate-in-up" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-border bg-surface p-5 shadow-[var(--shadow-popover)] data-[state=open]:animate-in-up">
          <AlertDialogPrimitive.Title className="text-[16px] font-semibold text-fg">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
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
