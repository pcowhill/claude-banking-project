import { describe, expect, it } from 'vitest';
import { config, overrideConfigForTests, resolveConfig } from './config';

/**
 * Deployment posture is decided by TWO independent flags: `NODE_ENV=production`
 * (secure cookies) and `PUBLIC_DEMO=true` (shared-demo behaviour). Neither may
 * be inferred from the other.
 */
describe('resolveConfig', () => {
  it('local development: plain cookies, no public-demo behaviour, no rate limits', () => {
    const c = resolveConfig({});
    expect(c.environment).toBe('development');
    expect(c.isProduction).toBe(false);
    expect(c.publicDemo).toBe(false);
    expect(c.secureCookies).toBe(false);
    expect(c.rateLimitsEnabled).toBe(false);
    expect(c.host).toBe('127.0.0.1');
  });

  it('NODE_ENV=production turns on Secure cookies but NOT public-demo mode', () => {
    const c = resolveConfig({ NODE_ENV: 'production' });
    expect(c.isProduction).toBe(true);
    expect(c.secureCookies).toBe(true);
    expect(c.publicDemo).toBe(false);
    expect(c.rateLimitsEnabled).toBe(false);
  });

  it('PUBLIC_DEMO=true is explicit and opt-in, and enables the abuse limits', () => {
    const c = resolveConfig({ NODE_ENV: 'production', PUBLIC_DEMO: 'true' });
    expect(c.publicDemo).toBe(true);
    expect(c.rateLimitsEnabled).toBe(true);
    // Only explicit truthy spellings count.
    expect(resolveConfig({ PUBLIC_DEMO: 'production' }).publicDemo).toBe(false);
    expect(resolveConfig({ PUBLIC_DEMO: '' }).publicDemo).toBe(false);
  });

  it('COOKIE_SECURE overrides the NODE_ENV default either way', () => {
    expect(resolveConfig({ NODE_ENV: 'development', COOKIE_SECURE: 'true' }).secureCookies).toBe(
      true,
    );
    expect(resolveConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).secureCookies).toBe(
      false,
    );
  });

  it('RATE_LIMITS=true forces the limiter on outside public-demo mode (local testing)', () => {
    expect(resolveConfig({ RATE_LIMITS: 'true' }).rateLimitsEnabled).toBe(true);
  });

  it('parses the port and origin lists', () => {
    const c = resolveConfig({
      PORT: '8102',
      HOST: '127.0.0.1',
      CORS_ORIGINS: 'https://banking.cowhill.dev, https://banking-ops.cowhill.dev',
      OPERATIONS_ORIGINS: 'https://banking-ops.cowhill.dev',
    });
    expect(c.port).toBe(8102);
    expect(c.corsOrigins).toEqual([
      'https://banking.cowhill.dev',
      'https://banking-ops.cowhill.dev',
    ]);
    expect(c.operationsOrigins).toEqual(['https://banking-ops.cowhill.dev']);
  });
});

describe('overrideConfigForTests', () => {
  it('patches the live config and restores it', () => {
    const before = config.publicDemo;
    const restore = overrideConfigForTests({ publicDemo: !before });
    expect(config.publicDemo).toBe(!before);
    restore();
    expect(config.publicDemo).toBe(before);
  });
});
