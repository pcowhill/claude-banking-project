/**
 * @simbank/shared — public barrel.
 *
 * Pure, dependency-free TypeScript shared by the backend and both frontend
 * apps: branding tokens, version/meta, money + ledger math, domain types, and
 * shared constants. Keep this package free of runtime dependencies and of any
 * Node- or browser-specific APIs so every workspace can import it as source.
 */
export * from './version';
export * from './brand';
export * from './constants';
export * from './money';
export * from './ledger';
export * from './types';
