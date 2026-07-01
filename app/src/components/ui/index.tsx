import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

// ---- Button (shadcn-style, Linear palette) ----
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98] select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-brand-fg hover:bg-brand-hover shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_2px_8px_-2px_rgba(94,106,210,0.5)]',
        secondary:
          'bg-surface-2 text-fg border border-border hover:bg-elevated hover:border-[#2c2e33]',
        ghost: 'text-fg-muted hover:text-fg hover:bg-surface-2',
        subtle: 'bg-fg/[0.06] text-fg hover:bg-fg/[0.1]',
        danger: 'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/20',
        success: 'bg-success text-black font-semibold hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4',
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
export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-border bg-surface/80 backdrop-blur-xl ring-hairline',
        'shadow-[0_1px_2px_rgba(0,0,0,0.4),0_12px_40px_-16px_rgba(0,0,0,0.6)]',
        className,
      )}
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
        'text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-dim mb-2 mt-6 first:mt-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ---- Badge ----
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-2 text-fg-muted',
        brand: 'border-brand/30 bg-brand/12 text-[#aab2f0]',
        success: 'border-success/30 bg-success/10 text-success',
        warning: 'border-warning/25 bg-warning/10 text-warning',
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
  return <span className={cn(badgeVariants({ variant }), className)} style={style}>{children}</span>
}

// ---- Progress bar ----
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-[#b57edc] transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
