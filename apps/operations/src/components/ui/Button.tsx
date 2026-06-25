import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'approve' | 'reject' | 'hold' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-teal text-white hover:bg-brand-teal-dark',
  approve: 'bg-emerald-600 text-white hover:bg-emerald-500',
  reject: 'bg-rose-600 text-white hover:bg-rose-500',
  hold: 'bg-amber-500 text-brand-navy-deep hover:bg-amber-400',
  ghost: 'bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-10 px-4 text-sm',
};

/** Operator action button (approve/reject/hold/etc). */
export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy-deep',
        'disabled:pointer-events-none disabled:opacity-40',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
