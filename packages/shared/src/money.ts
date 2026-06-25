/**
 * Money helpers. The platform stores ALL money as integer minor units (cents)
 * to avoid floating-point drift. Never store currency as a float. UI formatting
 * is the only place we divide by 100.
 */

/** A monetary amount in integer minor units (e.g. cents). */
export type Minor = number;

export class MoneyError extends Error {}

/** Assert that a value is a safe integer number of minor units. */
export function assertMinor(value: number, label = 'amount'): asserts value is Minor {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of minor units, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range: ${value}`);
  }
}

/** Convert a major-unit amount (dollars) to minor units (cents). */
export function toMinor(major: number): Minor {
  return Math.round(major * 100);
}

/** Convert minor units (cents) back to major units (dollars). */
export function toMajor(minor: Minor): number {
  assertMinor(minor);
  return minor / 100;
}

/** Sum a list of minor-unit amounts, validating each. */
export function sumMinor(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) {
    assertMinor(v);
    total += v;
  }
  return total;
}

/** Format a minor-unit amount as a localized currency string. */
export function formatMinor(minor: Minor, currency = 'USD', locale = 'en-US'): string {
  assertMinor(minor);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}
