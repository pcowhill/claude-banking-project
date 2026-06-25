import { describe, it, expect } from 'vitest';
import { assertMinor, formatMinor, MoneyError, sumMinor, toMajor, toMinor } from './money';

describe('money', () => {
  it('converts between major and minor units without float drift', () => {
    expect(toMinor(10.99)).toBe(1099);
    expect(toMinor(0.1)).toBe(10);
    expect(toMajor(1099)).toBe(10.99);
  });

  it('rejects non-integer minor units', () => {
    expect(() => assertMinor(10.5)).toThrow(MoneyError);
  });

  it('sums minor amounts and validates each', () => {
    expect(sumMinor([100, 250, -50])).toBe(300);
    expect(() => sumMinor([100, 0.5])).toThrow(MoneyError);
  });

  it('formats minor units as currency', () => {
    expect(formatMinor(123456)).toBe('$1,234.56');
    expect(formatMinor(-5000)).toBe('-$50.00');
  });
});
