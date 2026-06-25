import { describe, expect, it } from 'vitest';
import { AUTH } from '@simbank/shared';
import { generateSessionToken, hashSessionToken } from './tokens';

describe('session tokens (pure)', () => {
  it('generates a high-entropy hex token of the configured length', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(token).toHaveLength(AUTH.sessionTokenBytes * 2); // hex = 2 chars/byte
  });

  it('generates a different token each time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it('hashes deterministically and never returns the raw token', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toBe(hashSessionToken(token)); // deterministic
    expect(hash).not.toBe(token); // not reversible to the raw token
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it('produces distinct hashes for distinct tokens', () => {
    expect(hashSessionToken('a')).not.toBe(hashSessionToken('b'));
  });
});
