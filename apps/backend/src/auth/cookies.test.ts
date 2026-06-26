import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { AUTH } from '@simbank/shared';
import {
  sessionAudienceForOrigin,
  sessionAudienceForRequest,
  sessionAudienceFromHeader,
} from './cookies';

/**
 * Surface resolution for the per-app session cookie (v0.6.2 / B-06).
 *
 * The operations console and the customer portal share one backend origin, so
 * the backend must know which surface each request is from to read the right
 * session cookie. The EXPLICIT surface header is the reliable signal; the Origin
 * header is a fallback because browsers omit it on same-origin GETs (which is
 * what made the ops console 401 and loop on the sign-in screen in v0.6.1).
 */

const OPS_ORIGIN = 'http://localhost:5174';
const CUSTOMER_ORIGIN = 'http://localhost:5173';

/** Build a minimal request carrying just the headers the resolver reads. */
function reqWith(headers: Record<string, string | undefined>): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

describe('sessionAudienceFromHeader', () => {
  it('returns the declared surface for valid values', () => {
    expect(sessionAudienceFromHeader('operations')).toBe('operations');
    expect(sessionAudienceFromHeader('customer')).toBe('customer');
  });

  it('takes the first value when the header is repeated', () => {
    expect(sessionAudienceFromHeader(['operations', 'customer'])).toBe('operations');
  });

  it('returns null for missing or unknown values (so the caller falls back to Origin)', () => {
    expect(sessionAudienceFromHeader(undefined)).toBeNull();
    expect(sessionAudienceFromHeader('')).toBeNull();
    expect(sessionAudienceFromHeader('admin')).toBeNull();
    expect(sessionAudienceFromHeader('OPERATIONS')).toBeNull(); // exact match only
  });
});

describe('sessionAudienceForOrigin (fallback)', () => {
  it('recognizes the ops origin and the ops port, else defaults to customer', () => {
    expect(sessionAudienceForOrigin(OPS_ORIGIN)).toBe('operations');
    expect(sessionAudienceForOrigin('http://192.168.1.10:5174')).toBe('operations'); // LAN, ops port
    expect(sessionAudienceForOrigin(CUSTOMER_ORIGIN)).toBe('customer');
    expect(sessionAudienceForOrigin(undefined)).toBe('customer'); // no Origin → least-privileged
    expect(sessionAudienceForOrigin('not a url')).toBe('customer');
  });
});

describe('sessionAudienceForRequest precedence', () => {
  it('trusts the surface header ahead of the Origin', () => {
    // The exact same-origin shape that broke the console: ops cookie wanted, but
    // no Origin on the GET — the header carries the surface so it still resolves.
    expect(sessionAudienceForRequest(reqWith({ [AUTH.surfaceHeader]: 'operations' }))).toBe(
      'operations',
    );
    // Header wins even if a (stale/proxied) Origin would say otherwise.
    expect(
      sessionAudienceForRequest(
        reqWith({ [AUTH.surfaceHeader]: 'operations', origin: CUSTOMER_ORIGIN }),
      ),
    ).toBe('operations');
  });

  it('falls back to Origin when no surface header is present', () => {
    expect(sessionAudienceForRequest(reqWith({ origin: OPS_ORIGIN }))).toBe('operations');
    expect(sessionAudienceForRequest(reqWith({ origin: CUSTOMER_ORIGIN }))).toBe('customer');
  });

  it('defaults to customer when neither signal is present', () => {
    expect(sessionAudienceForRequest(reqWith({}))).toBe('customer');
  });
});
