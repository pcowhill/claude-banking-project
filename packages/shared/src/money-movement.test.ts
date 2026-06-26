import { describe, expect, it } from 'vitest';
import {
  asMovementPayload,
  isMovementKind,
  isReviewableMovement,
  MOVEMENT_LIMITS,
  movementLedgerOrigin,
  movementOpsType,
  validateExternalMovement,
  validateTransfer,
  type MovementPayload,
} from './money-movement';

/**
 * The money-movement contract is pure and shared by the customer form and the
 * backend, so these tests are the single source of truth for what a valid
 * transfer / external movement is, how a kind maps to an ops type + ledger
 * origin, and how the stored payload is parsed.
 */
describe('money-movement contract (v0.7.0)', () => {
  describe('kinds & mapping', () => {
    it('treats every kind except internal_transfer as reviewable', () => {
      expect(isReviewableMovement('internal_transfer')).toBe(false);
      expect(isReviewableMovement('external_ach')).toBe(true);
      expect(isReviewableMovement('wire')).toBe(true);
      expect(isReviewableMovement('mobile_check_deposit')).toBe(true);
      expect(isReviewableMovement('bill_pay')).toBe(true);
    });

    it('maps reviewable kinds to their ops request type', () => {
      expect(movementOpsType('mobile_check_deposit')).toBe('deposit');
      expect(movementOpsType('external_ach')).toBe('ach');
      expect(movementOpsType('wire')).toBe('wire');
      expect(movementOpsType('bill_pay')).toBe('bill_pay');
    });

    it('derives the ledger origin: transfer / deposit (in) / payment (out)', () => {
      expect(movementLedgerOrigin('internal_transfer', 'outbound')).toBe('transfer');
      expect(movementLedgerOrigin('mobile_check_deposit', 'inbound')).toBe('deposit');
      expect(movementLedgerOrigin('external_ach', 'inbound')).toBe('deposit');
      expect(movementLedgerOrigin('external_ach', 'outbound')).toBe('payment');
      expect(movementLedgerOrigin('wire', 'outbound')).toBe('payment');
      expect(movementLedgerOrigin('bill_pay', 'outbound')).toBe('payment');
    });

    it('isMovementKind narrows strings', () => {
      expect(isMovementKind('wire')).toBe(true);
      expect(isMovementKind('nope')).toBe(false);
      expect(isMovementKind(42)).toBe(false);
    });
  });

  describe('validateTransfer', () => {
    const ok = { fromAccountId: 'a1', toAccountId: 'a2', amountMinor: 5_00 };

    it('accepts a valid transfer and normalizes the memo', () => {
      const r = validateTransfer({ ...ok, memo: '  rent  ' });
      expect(r.ok).toBe(true);
      expect(r.value).toEqual({ fromAccountId: 'a1', toAccountId: 'a2', amountMinor: 500, memo: 'rent' });
    });

    it('requires two DIFFERENT accounts', () => {
      expect(validateTransfer({ fromAccountId: 'a1', toAccountId: 'a1', amountMinor: 500 }).errors.toAccountId).toBeTruthy();
      expect(validateTransfer({ amountMinor: 500 }).errors.fromAccountId).toBeTruthy();
    });

    it('enforces the amount bounds (integer minor units, min/max)', () => {
      expect(validateTransfer({ ...ok, amountMinor: 0 }).errors.amountMinor).toBeTruthy();
      expect(validateTransfer({ ...ok, amountMinor: 1.5 }).errors.amountMinor).toBeTruthy();
      expect(validateTransfer({ ...ok, amountMinor: MOVEMENT_LIMITS.maxMinor + 1 }).errors.amountMinor).toBeTruthy();
      expect(validateTransfer({ ...ok, amountMinor: MOVEMENT_LIMITS.minMinor }).ok).toBe(true);
      expect(validateTransfer({ ...ok, amountMinor: MOVEMENT_LIMITS.maxMinor }).ok).toBe(true);
    });
  });

  describe('validateExternalMovement', () => {
    it('accepts a mobile check deposit with no counterparty (inbound, fixed direction)', () => {
      const r = validateExternalMovement({ accountId: 'a1', kind: 'mobile_check_deposit', amountMinor: 320_00 });
      expect(r.ok).toBe(true);
      expect(r.value).toMatchObject({ kind: 'mobile_check_deposit', direction: 'inbound', counterparty: null });
    });

    it('requires a biller for a bill payment (outbound, fixed direction)', () => {
      expect(validateExternalMovement({ accountId: 'a1', kind: 'bill_pay', amountMinor: 50_00 }).errors.counterparty).toBeTruthy();
      const r = validateExternalMovement({ accountId: 'a1', kind: 'bill_pay', amountMinor: 50_00, counterparty: 'City Power' });
      expect(r.ok).toBe(true);
      expect(r.value).toMatchObject({ direction: 'outbound', counterparty: 'City Power' });
    });

    it('forces a wire to be outbound and requires a recipient', () => {
      const r = validateExternalMovement({ accountId: 'a1', kind: 'wire', amountMinor: 1_000_00, counterparty: 'Acme LLC' });
      expect(r.ok).toBe(true);
      expect(r.value!.direction).toBe('outbound');
    });

    it('makes an external ACH declare a direction', () => {
      expect(validateExternalMovement({ accountId: 'a1', kind: 'external_ach', amountMinor: 100_00, counterparty: 'Ext Bank' }).errors.direction).toBeTruthy();
      const inbound = validateExternalMovement({ accountId: 'a1', kind: 'external_ach', amountMinor: 100_00, counterparty: 'Ext Bank', direction: 'inbound' });
      expect(inbound.ok).toBe(true);
      expect(inbound.value!.direction).toBe('inbound');
    });

    it('rejects internal_transfer (not a reviewable movement) and unknown kinds', () => {
      expect(validateExternalMovement({ accountId: 'a1', kind: 'internal_transfer', amountMinor: 100 }).errors.kind).toBeTruthy();
      expect(validateExternalMovement({ accountId: 'a1', kind: 'bogus', amountMinor: 100 }).errors.kind).toBeTruthy();
    });

    it('enforces the amount bounds', () => {
      expect(validateExternalMovement({ accountId: 'a1', kind: 'mobile_check_deposit', amountMinor: 0 }).errors.amountMinor).toBeTruthy();
      expect(validateExternalMovement({ accountId: 'a1', kind: 'mobile_check_deposit', amountMinor: MOVEMENT_LIMITS.maxMinor + 1 }).errors.amountMinor).toBeTruthy();
    });
  });

  describe('asMovementPayload', () => {
    it('parses a well-formed payload', () => {
      const payload: MovementPayload = {
        kind: 'bill_pay',
        amountMinor: 5_00,
        direction: 'outbound',
        accountId: 'a1',
        counterparty: 'City Power',
        memo: null,
        ledgerEntryIds: ['le1'],
      };
      expect(asMovementPayload(payload)).toMatchObject({ kind: 'bill_pay', amountMinor: 500, ledgerEntryIds: ['le1'] });
    });

    it('returns null for non-movement payloads (e.g. an onboarding payload)', () => {
      expect(asMovementPayload({ reference: 'MER-1', product: 'checking' })).toBeNull();
      expect(asMovementPayload(null)).toBeNull();
      expect(asMovementPayload('nope')).toBeNull();
    });

    it('coerces a missing ledgerEntryIds to an empty array', () => {
      const p = asMovementPayload({ kind: 'wire', amountMinor: 100, direction: 'outbound' });
      expect(p).not.toBeNull();
      expect(p!.ledgerEntryIds).toEqual([]);
    });
  });
});
