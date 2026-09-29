import { PUBLIC_DEMO_NOTICE } from '@simbank/shared';
import { usePublicDemo } from '../lib/public-demo';
import { cn } from '../lib/cn';

interface PublicDemoNoticeProps {
  /** `banner` — slim line under the simulation bar; `form` — callout above the sign-in form. */
  variant?: 'banner' | 'form';
  className?: string;
}

/**
 * The shared-public-demo warning for the operator console. Rendered ONLY in
 * public-demo mode; nothing changes in local development. Complements the
 * always-on "simulates bank operations / not a real bank system" banner.
 */
export function PublicDemoNotice({ variant = 'banner', className }: PublicDemoNoticeProps) {
  const publicDemo = usePublicDemo();
  if (!publicDemo) return null;

  if (variant === 'form') {
    return (
      <div
        role="note"
        data-testid="public-demo-notice-form"
        className={cn(
          'rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100',
          className,
        )}
      >
        <p className="font-semibold">{PUBLIC_DEMO_NOTICE.label}</p>
        <p className="mt-1 text-[13px] leading-snug text-amber-100/90">
          {PUBLIC_DEMO_NOTICE.operations} Use only the seeded demo logins or fictional details —
          never real personal information or a password you use elsewhere.
        </p>
      </div>
    );
  }

  return (
    <div
      role="note"
      data-testid="public-demo-notice-banner"
      className={cn(
        'w-full border-b border-amber-400/30 bg-amber-400/10 text-amber-100',
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-1.5 text-xs sm:items-center">
        <span className="inline-flex shrink-0 items-center rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-navy-deep">
          {PUBLIC_DEMO_NOTICE.label}
        </span>
        <span>{PUBLIC_DEMO_NOTICE.short}</span>
      </div>
    </div>
  );
}
