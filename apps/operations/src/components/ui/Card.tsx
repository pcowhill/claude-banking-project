import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Dark console surface card. */
export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
}
