import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';
import { ImagePlaceholder } from './ImagePlaceholder';

/**
 * Shared building blocks for the public marketing site (v0.3.0). Centralizing
 * these keeps every product/marketing page visually consistent and lets each
 * page file stay focused on content. Everything here is presentational and
 * brand-token driven; no data or auth logic lives in this module.
 */

// ---- Icons (inline, dependency-free) ---------------------------------------

export type IconName =
  | 'shield'
  | 'bolt'
  | 'chart'
  | 'piggy'
  | 'card'
  | 'phone'
  | 'lock'
  | 'compass'
  | 'sparkles'
  | 'receipt'
  | 'clock'
  | 'globe';

const ICON_PATHS: Record<IconName, ReactNode> = {
  shield: <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  chart: <path d="M4 19V5m0 14h16M8 19v-6m4 6V9m4 10v-8" />,
  piggy: <path d="M4 12a6 6 0 016-6h5a5 5 0 015 5 5 5 0 01-2 4v3h-3v-2H9v2H6v-3a6 6 0 01-2-4zm12-1h.01" />,
  card: <path d="M3 6h18v12H3V6zm0 4h18M7 15h4" />,
  phone: <path d="M8 3h8v18H8V3zm3 15h2" />,
  lock: <path d="M6 11V8a6 6 0 1112 0v3M5 11h14v10H5V11z" />,
  compass: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm3-12l-2 5-4 1 2-5 4-1z" />,
  sparkles: <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16z" />,
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zm3 5h6M9 12h6" />,
  clock: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-13v5l3 2" />,
  globe: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm-9-9h18M12 3c2.5 2.5 3 6 3 9s-.5 6.5-3 9c-2.5-2.5-3-6-3-9s.5-6.5 3-9z" />,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-6 w-6', className)}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// ---- Layout primitives ------------------------------------------------------

type SectionTone = 'default' | 'muted' | 'navy';

const sectionToneClasses: Record<SectionTone, string> = {
  default: 'bg-white',
  muted: 'bg-brand-mist',
  navy: 'bg-brand-navy text-white',
};

/** A full-width band with consistent vertical rhythm and a centered container. */
export function Section({
  children,
  tone = 'default',
  className,
  id,
}: {
  children: ReactNode;
  tone?: SectionTone;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn(sectionToneClasses[tone])}>
      <div className={cn('mx-auto max-w-6xl px-4 py-14 sm:py-16', className)}>{children}</div>
    </section>
  );
}

/** Small uppercase eyebrow label above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-brand-teal/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-teal-dark',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Standard section header: optional eyebrow, a title, and an optional subtitle. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  tone = 'dark',
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'left' | 'center';
  tone?: 'dark' | 'light';
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
      <h2
        className={cn(
          'text-2xl font-bold sm:text-3xl',
          tone === 'light' ? 'text-white' : 'text-brand-navy',
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={cn('mt-3 text-base', tone === 'light' ? 'text-white/75' : 'text-slate-600')}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** A milestone tag (e.g. "Arrives v0.8.0") for not-yet-built features. */
export function MilestoneTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-brand-gold/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---- Page hero (inner marketing pages) -------------------------------------

export interface HeroImage {
  src: string;
  alt: string;
  label: string;
}

export interface HeroCTA {
  to: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}

/**
 * Standard hero for inner product/marketing pages: eyebrow + title + lead copy
 * with optional CTAs on the left, and an optional drop-in image on the right.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  ctas,
  image,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  ctas?: HeroCTA[];
  image?: HeroImage;
  children?: ReactNode;
}) {
  return (
    <section className="bg-gradient-to-b from-brand-mist to-white">
      <div
        className={cn(
          'mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-16',
          image && 'lg:grid-cols-2',
        )}
      >
        <div>
          {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
          <h1 className="text-3xl font-bold leading-tight text-brand-navy sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {lead && <p className="mt-4 max-w-xl text-lg text-slate-600">{lead}</p>}
          {ctas && ctas.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3">
              {ctas.map((cta) => (
                <Link key={cta.to + cta.label} to={cta.to}>
                  <Button size="lg" variant={cta.variant ?? 'primary'}>
                    {cta.label}
                  </Button>
                </Link>
              ))}
            </div>
          )}
          {children}
        </div>
        {image && (
          <div className="overflow-hidden rounded-2xl shadow-lg">
            <ImagePlaceholder
              src={image.src}
              alt={image.alt}
              label={image.label}
              className="aspect-[16/11] w-full"
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ---- Feature grid -----------------------------------------------------------

export interface Feature {
  icon: IconName;
  title: string;
  description: string;
  /** Optional roadmap tag for "coming soon" features. */
  milestone?: string;
}

export function FeatureGrid({
  features,
  columns = 3,
}: {
  features: Feature[];
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        'mt-10 grid gap-5 sm:grid-cols-2',
        columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
      )}
    >
      {features.map((feature) => (
        <div
          key={feature.title}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-mist text-brand-teal-dark">
            <Icon name={feature.icon} />
          </span>
          <div className="mt-4 flex items-center gap-2">
            <h3 className="text-base font-semibold text-brand-navy">{feature.title}</h3>
            {feature.milestone && <MilestoneTag>{feature.milestone}</MilestoneTag>}
          </div>
          <p className="mt-1.5 text-sm text-slate-600">{feature.description}</p>
        </div>
      ))}
    </div>
  );
}

// ---- FAQ (accessible, no JS — native <details>) -----------------------------

export interface QA {
  q: string;
  a: ReactNode;
}

export function FAQ({ items }: { items: QA[] }) {
  return (
    <div className="mt-8 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
            {item.q}
            <span
              className="ml-2 shrink-0 text-brand-teal-dark transition-transform group-open:rotate-45"
              aria-hidden="true"
            >
              +
            </span>
          </summary>
          <div className="mt-2 text-sm text-slate-600">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

// ---- Call-to-action band ----------------------------------------------------

/**
 * Closing CTA used at the foot of marketing pages. Primary action defaults to
 * opening a (simulated) account; a secondary action points at the live login.
 */
export function CTASection({
  title = 'Ready to explore Meridian?',
  body = 'Open a simulated account or sign in with a seeded demo login — no real money, ever.',
  primaryLabel = 'Open a (simulated) account',
  primaryTo = '/open-account',
  secondaryLabel = 'Log in',
  secondaryTo = '/login',
}: {
  title?: string;
  body?: string;
  primaryLabel?: string;
  primaryTo?: string;
  secondaryLabel?: string;
  secondaryTo?: string;
}) {
  return (
    <Section tone="navy">
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
          <p className="mt-2 text-white/75">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to={primaryTo}>
            <Button size="lg" variant="secondary">
              {primaryLabel}
            </Button>
          </Link>
          <Link to={secondaryTo}>
            <Button
              size="lg"
              variant="ghost"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
            >
              {secondaryLabel}
            </Button>
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ---- Simulated rates / fees table ------------------------------------------

export interface RateRow {
  label: string;
  value: string;
  note?: string;
}

/**
 * A small disclosure table for simulated rates/fees. The heading makes the
 * simulated nature explicit so the numbers are never mistaken for real terms.
 */
export function RateTable({ caption, rows }: { caption: string; rows: RateRow[] }) {
  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="border-b border-slate-200 bg-brand-mist px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          {caption} · illustrative simulated figures
        </caption>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="px-5 py-3 font-medium text-slate-700">
                {row.label}
                {row.note && <span className="block text-xs font-normal text-slate-400">{row.note}</span>}
              </th>
              <td className="px-5 py-3 text-right font-semibold text-brand-navy">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
