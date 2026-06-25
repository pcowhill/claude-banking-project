import type { UserRole } from '@simbank/shared';
import { cn } from '../lib/cn';

/** Human label + accent for each role the console may display. */
const ROLE_META: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-brand-gold/20 text-brand-gold-soft' },
  ops_agent: { label: 'Ops agent', className: 'bg-brand-teal/20 text-brand-teal' },
  customer: { label: 'Customer', className: 'bg-white/10 text-slate-300' },
  joint_customer: { label: 'Joint customer', className: 'bg-white/10 text-slate-300' },
};

/** Small pill that shows a user's role; used in the operator header. */
export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const meta = ROLE_META[role];
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
