/**
 * Branding tokens for the fictional bank, "Meridian".
 *
 * IMPORTANT: Meridian is an invented brand for a LOCAL SIMULATION. It is not a
 * real financial institution and these assets must never be presented as such.
 *
 * The palette is also mirrored in each app's tailwind.config.js so Tailwind
 * utility classes (e.g. `bg-brand-navy`) stay in sync with runtime values.
 */
export const BRAND = {
  /** Short display name used in nav bars and the wordmark. */
  name: 'Meridian',
  /** Longer name used on marketing surfaces. */
  legalName: 'Meridian Bank (Simulated)',
  /** Always-on disclaimer shown in UI banners and footers. */
  tagline: 'Banking that keeps you on course.',
  simulationNotice:
    'Simulated banking environment for development and demos only. Not a real bank. No real money, accounts, or transactions.',
} as const;

/**
 * Core color tokens. Trustworthy national-bank palette: deep navy + teal with a
 * restrained gold accent on a white/slate canvas.
 */
export const BRAND_COLORS = {
  navy: '#0A2540',
  navyDeep: '#071B30',
  teal: '#0EA5A4',
  tealDark: '#0B7E7D',
  gold: '#E0A82E',
  goldSoft: '#F2C14E',
  ink: '#0F172A',
  slate: '#475569',
  mist: '#F1F5F9',
  white: '#FFFFFF',
} as const;

export type BrandColorToken = keyof typeof BRAND_COLORS;
