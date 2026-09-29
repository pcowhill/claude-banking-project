import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from './rate-limit';

describe('FixedWindowLimiter', () => {
  it('allows up to max hits in a window, then blocks with a retry-after', () => {
    const limiter = new FixedWindowLimiter({ max: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect(limiter.hit('a', t0)).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.hit('a', t0 + 1)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.hit('a', t0 + 2)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = limiter.hit('a', t0 + 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(59);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('keys are independent', () => {
    const limiter = new FixedWindowLimiter({ max: 1, windowMs: 60_000 });
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('b', 0).allowed).toBe(true);
    expect(limiter.hit('a', 1).allowed).toBe(false);
  });

  it('a new window starts once the old one has elapsed', () => {
    const limiter = new FixedWindowLimiter({ max: 1, windowMs: 1_000 });
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('a', 999).allowed).toBe(false);
    expect(limiter.hit('a', 1_000).allowed).toBe(true);
  });

  it('memory is bounded: the oldest keys are evicted past maxKeys', () => {
    const limiter = new FixedWindowLimiter({ max: 5, windowMs: 60_000 }, 100);
    for (let i = 0; i < 250; i++) limiter.hit(`k${i}`, i);
    expect(limiter.size).toBeLessThanOrEqual(100);
    // The most recent key is still tracked with its count.
    expect(limiter.hit('k249', 300).remaining).toBe(3);
  });

  it('expired entries are swept opportunistically', () => {
    const limiter = new FixedWindowLimiter({ max: 1_000, windowMs: 100 }, 10_000);
    for (let i = 0; i < 300; i++) limiter.hit(`k${i}`, 0);
    expect(limiter.size).toBe(300);
    // Once those windows are stale, the periodic sweep (every 256 hits) drops them.
    for (let i = 0; i < 300; i++) limiter.hit('fresh', 1_000);
    expect(limiter.size).toBe(1);
  });

  it('reset forgets everything', () => {
    const limiter = new FixedWindowLimiter({ max: 1, windowMs: 60_000 });
    limiter.hit('a', 0);
    limiter.reset();
    expect(limiter.size).toBe(0);
    expect(limiter.hit('a', 1).allowed).toBe(true);
  });

  it('rejects a nonsensical rule', () => {
    expect(() => new FixedWindowLimiter({ max: 0, windowMs: 1 })).toThrow();
  });
});
