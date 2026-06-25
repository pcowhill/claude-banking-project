import { describe, expect, it } from 'vitest';
import { DECOY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';

describe('password hashing (bcryptjs)', () => {
  it('produces a bcrypt hash that is not the plaintext', async () => {
    const hash = await hashPassword('Customer123!');
    expect(hash).not.toBe('Customer123!');
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt identifier
  });

  it('salts: hashing the same password twice yields different hashes', async () => {
    const a = await hashPassword('Customer123!');
    const b = await hashPassword('Customer123!');
    expect(a).not.toBe(b);
  });

  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('Customer123!');
    expect(await verifyPassword('Customer123!', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('treats a missing hash as a failed verification (never throws)', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', undefined)).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('exposes a decoy hash that no real password matches', async () => {
    expect(DECOY_PASSWORD_HASH).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('Customer123!', DECOY_PASSWORD_HASH)).toBe(false);
  });
});
