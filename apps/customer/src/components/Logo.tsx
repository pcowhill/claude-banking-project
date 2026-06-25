import { cn } from '../lib/cn';

interface LogoProps {
  variant?: 'full' | 'mark';
  tone?: 'color' | 'light';
  className?: string;
}

/**
 * Inline SVG of the Meridian compass logo. Rendered inline (rather than via an
 * <img>) so it scales crisply and themes with `tone`. Canonical standalone SVGs
 * live in assets/brand/.
 */
export function Logo({ variant = 'full', tone = 'color', className }: LogoProps) {
  const showWordmark = variant === 'full';
  const viewBox = showWordmark ? '0 0 252 64' : '0 0 64 64';
  const wordmarkFill = tone === 'light' ? '#FFFFFF' : '#0A2540';

  return (
    <svg
      viewBox={viewBox}
      className={cn('block h-8 w-auto', className)}
      fill="none"
      role="img"
      aria-label="Meridian, a simulated bank"
      xmlns="http://www.w3.org/2000/svg"
    >
      {tone === 'light' ? (
        <>
          <circle cx="32" cy="32" r="30" stroke="#FFFFFF" strokeWidth="2" fill="none" />
          <polygon points="32,9 27,32 32,32" fill="#FFFFFF" fillOpacity="0.9" />
          <polygon points="32,9 37,32 32,32" fill="#FFFFFF" />
          <polygon points="32,55 27,32 32,32" fill="#FFFFFF" fillOpacity="0.55" />
          <polygon points="32,55 37,32 32,32" fill="#FFFFFF" fillOpacity="0.7" />
          <circle cx="32" cy="32" r="3.5" fill="#FFFFFF" />
        </>
      ) : (
        <>
          <circle cx="32" cy="32" r="30" fill="#0A2540" />
          <circle cx="32" cy="32" r="30" stroke="#0EA5A4" strokeWidth="2" />
          <polygon points="32,9 27,32 32,32" fill="#FFFFFF" />
          <polygon points="32,9 37,32 32,32" fill="#F2C14E" />
          <polygon points="32,55 27,32 32,32" fill="#0B7E7D" />
          <polygon points="32,55 37,32 32,32" fill="#0EA5A4" />
          <circle cx="32" cy="32" r="3.5" fill="#E0A82E" />
        </>
      )}
      {showWordmark && (
        <text
          x="76"
          y="41"
          fontFamily="Inter, 'Segoe UI', system-ui, sans-serif"
          fontSize="30"
          fontWeight="700"
          fill={wordmarkFill}
          letterSpacing="0.3"
        >
          Meridian
        </text>
      )}
    </svg>
  );
}
