import { PUBLIC_DEMO_NOTICE } from '@simbank/shared';
import { usePublicDemo } from '../lib/public-demo';
import { cn } from '../lib/cn';

interface PublicDemoNoticeProps {
  /**
   * `banner`  — the slim line under the always-on simulation bar (every page).
   * `form`    — the prominent callout shown BEFORE a visitor types a name, email,
   *             or password (open-account application, sign-in).
   */
  variant?: 'banner' | 'form';
  className?: string;
}

/**
 * The shared-public-demo warning. Rendered ONLY in public-demo mode (see
 * `lib/public-demo.ts`); in local development it renders nothing, so the
 * existing UI is untouched. It complements — never replaces — the always-on
 * "not a real bank / no real money" messaging.
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
          'rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900',
          className,
        )}
      >
        <p className="font-semibold">{PUBLIC_DEMO_NOTICE.label} — please read before you type</p>
        <p className="mt-1 text-[13px] leading-snug">{PUBLIC_DEMO_NOTICE.beforeYouType}</p>
      </div>
    );
  }

  return (
    <div
      role="note"
      data-testid="public-demo-notice-banner"
      className={cn('w-full border-b border-amber-200 bg-amber-50 text-amber-900', className)}
    >
      <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-1.5 text-xs sm:items-center">
        <span className="inline-flex shrink-0 items-center rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {PUBLIC_DEMO_NOTICE.label}
        </span>
        <span>{PUBLIC_DEMO_NOTICE.short}</span>
      </div>
    </div>
  );
}
