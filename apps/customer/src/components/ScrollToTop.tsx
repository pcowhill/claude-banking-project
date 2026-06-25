import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll position on every client-side navigation (v0.4.0, task R-01).
 *
 * React Router does not move the scroll position when the route changes, so
 * navigating from a long page to another page would otherwise leave the visitor
 * scrolled half-way down the new page. This effect makes every navigation land
 * at the TOP of the destination — for ANY control that navigates (header,
 * footer, hero buttons, in-page CTAs) since it keys off the location, not the
 * link that was clicked.
 *
 * Exception: if the destination URL carries a `#hash` (e.g. the "Security" link
 * → `/about#security`), scroll that section into view instead. Section targets
 * carry a `scroll-mt` so the sticky header does not cover the heading.
 *
 * Rendered once, just inside the Router. Renders nothing.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      const scrollToTarget = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ block: 'start' });
          return true;
        }
        return false;
      };
      // The target is usually present immediately after the route commits, but
      // give it one more frame before falling back to the top (covers a target
      // that is rendered a tick later).
      if (scrollToTarget()) return;
      const raf = requestAnimationFrame(() => {
        if (!scrollToTarget()) window.scrollTo({ top: 0, left: 0 });
      });
      return () => cancelAnimationFrame(raf);
    }

    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash]);

  return null;
}
