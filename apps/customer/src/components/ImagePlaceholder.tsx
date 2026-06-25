import { useState } from 'react';
import { cn } from '../lib/cn';

interface ImagePlaceholderProps {
  /** Path under public/, e.g. "/images/hero-family.jpg". */
  src: string;
  alt: string;
  /** Short label shown on the gradient when no real image exists yet. */
  label: string;
  className?: string;
}

/**
 * Renders a real image if it exists at `src`, otherwise a branded gradient
 * placeholder. This is what makes generated marketing images "drop-in": add the
 * file to public/images/ and it appears with no code change.
 */
export function ImagePlaceholder({ src, alt, label, className }: ImagePlaceholderProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={`${alt} (placeholder)`}
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-brand-navy via-brand-teal-dark to-brand-teal',
          'p-6 text-center text-xs font-medium text-white/85',
          className,
        )}
      >
        <span>
          {label}
          <span className="mt-1 block text-[10px] font-normal text-white/60">
            drop image at public{src}
          </span>
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}
