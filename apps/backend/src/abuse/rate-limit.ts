import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import {
  PUBLIC_DEMO_RATE_LIMITS,
  type ApiErrorResponse,
  type RateLimitBucket,
  type RateLimitRule,
} from '@simbank/shared';
import { config } from '../config';

/**
 * Lightweight abuse protection for the shared public demo.
 *
 * A fixed-window counter per (bucket, client key), held entirely in process
 * memory: no Redis, no database, no external service. That is the right
 * trade-off here on purpose — the public demo is ONE Node process on a tiny
 * host that is restarted and reset daily, so a limiter that forgets everything
 * on restart is exactly as durable as the rest of the demo state.
 *
 * Bounded memory: each bucket keeps at most `maxKeys` entries; when full, the
 * oldest entries are evicted (Map preserves insertion order), and expired
 * entries are swept opportunistically. A client key is a request IP (anonymous
 * routes) or a user id (authenticated routes) — kept in RAM only for the length
 * of a window, never persisted, never logged, so this adds no tracking.
 *
 * Off by default: `config.rateLimitsEnabled` is true in public-demo mode (or
 * with `RATE_LIMITS=true` for local testing); otherwise every hook below is a
 * no-op and local development is unaffected.
 */

interface WindowEntry {
  count: number;
  windowStart: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Remaining hits in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets (≥ 1). */
  retryAfterSeconds: number;
}

export class FixedWindowLimiter {
  readonly rule: RateLimitRule;
  readonly maxKeys: number;
  readonly #entries = new Map<string, WindowEntry>();
  #sinceSweep = 0;

  constructor(rule: RateLimitRule, maxKeys = 5_000) {
    if (rule.max < 1 || rule.windowMs < 1) throw new Error('Invalid rate-limit rule');
    this.rule = rule;
    this.maxKeys = maxKeys;
  }

  /** Number of keys currently tracked (for tests / diagnostics). */
  get size(): number {
    return this.#entries.size;
  }

  /** Count one hit for `key` at `now` and decide whether it is allowed. */
  hit(key: string, now: number = Date.now()): RateLimitDecision {
    this.#maybeSweep(now);
    const { max, windowMs } = this.rule;
    let entry = this.#entries.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      // Re-insert so the key moves to the "newest" end of the Map.
      this.#entries.delete(key);
      this.#entries.set(key, entry);
      this.#evictIfFull();
    }
    const resetIn = Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000));
    if (entry.count >= max) {
      return { allowed: false, remaining: 0, retryAfterSeconds: resetIn };
    }
    entry.count += 1;
    return { allowed: true, remaining: max - entry.count, retryAfterSeconds: resetIn };
  }

  /** Forget everything (tests; daily reset). */
  reset(): void {
    this.#entries.clear();
    this.#sinceSweep = 0;
  }

  #evictIfFull(): void {
    while (this.#entries.size > this.maxKeys) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  /** Every 256 hits, drop entries whose window has fully elapsed. */
  #maybeSweep(now: number): void {
    this.#sinceSweep += 1;
    if (this.#sinceSweep < 256) return;
    this.#sinceSweep = 0;
    for (const [key, entry] of this.#entries) {
      if (now - entry.windowStart >= this.rule.windowMs) this.#entries.delete(key);
    }
  }
}

/**
 * Is abuse protection active right now? Public-demo mode always implies it;
 * `RATE_LIMITS=true` (config.rateLimitsEnabled) forces it on elsewhere. Read
 * per call so tests can flip the posture on a built server.
 */
export function limitsActive(): boolean {
  return config.publicDemo || config.rateLimitsEnabled;
}

/** One limiter per named bucket, created lazily from the shared policy. */
const limiters = new Map<RateLimitBucket, FixedWindowLimiter>();

export function limiterFor(bucket: RateLimitBucket): FixedWindowLimiter {
  let limiter = limiters.get(bucket);
  if (!limiter) {
    limiter = new FixedWindowLimiter(PUBLIC_DEMO_RATE_LIMITS[bucket]);
    limiters.set(bucket, limiter);
  }
  return limiter;
}

/** Clear every bucket (tests). */
export function resetRateLimiters(): void {
  for (const limiter of limiters.values()) limiter.reset();
}

/**
 * The client key for a request: the authenticated user (when `requireAuth` has
 * already run) or the request IP. `req.ip` honours `X-Forwarded-For` because
 * the server trusts its (loopback) reverse proxy; the value lives only in the
 * in-memory window above.
 */
export function clientKey(req: FastifyRequest): string {
  const user = req.user;
  return user ? `user:${user.id}` : `ip:${req.ip ?? 'unknown'}`;
}

export function rateLimitedResponse(reply: FastifyReply, decision: RateLimitDecision): void {
  reply
    .header('retry-after', String(decision.retryAfterSeconds))
    .code(429)
    .send({
      error: 'Too many requests for this shared demo — please slow down and try again in a moment.',
      code: 'rate_limited',
    } satisfies ApiErrorResponse);
}

/**
 * A preHandler that enforces one bucket (plus the coarse `mutations` valve for
 * state-changing methods). Place it AFTER `requireAuth` on authenticated routes
 * so the key is the user, and first on anonymous routes (login / onboarding).
 * No-op unless abuse protection is enabled.
 */
export function rateLimit(bucket: RateLimitBucket): preHandlerHookHandler {
  return async (req, reply) => {
    if (!limitsActive()) return;
    const key = clientKey(req);
    const decision = limiterFor(bucket).hit(key);
    if (!decision.allowed) {
      rateLimitedResponse(reply, decision);
      return;
    }
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global `onRequest` valve: caps ALL state-changing requests per client so a
 * loop over any mutating endpoint — including ones without a specific bucket —
 * is bounded. Runs before auth, so its key is the request IP. No-op unless
 * abuse protection is enabled.
 */
export async function mutationValveHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!limitsActive()) return;
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;
  const decision = limiterFor('mutations').hit(`ip:${req.ip ?? 'unknown'}`);
  if (!decision.allowed) rateLimitedResponse(reply, decision);
}
