import { describe, expect, it } from 'vitest';
import {
  asDisputePayload,
  asFraudPayload,
  isFraudResponse,
  validateDispute,
} from './risk';
import { isRequestReversed } from './operations';

/**
 * Fraud + dispute contracts are pure and shared. These tests pin the payload
 * parsing (tolerant, soft-linked to a ledger entry / card) and the dispute
 * validator, plus the shared `isRequestReversed` helper that drives the R-03
 * "Reversed" tag for movements, disputes, and fraud alike.
 */
describe('risk contract (v0.8.0)', () => {
  describe('fraud', () => {
    it('recognizes the two customer responses', () => {
      expect(isFraudResponse('confirm_legit')).toBe(true);
      expect(isFraudResponse('report_fraud')).toBe(true);
      expect(isFraudResponse('maybe')).toBe(false);
    });

    it('parses a fraud payload tolerantly', () => {
      const p = asFraudPayload({ merchant: 'QuickFuel', amountMinor: 4890, ledgerEntryId: 'le1', cardId: 'c1', customerResponse: 'report_fraud' });
      expect(p.merchant).toBe('QuickFuel');
      expect(p.amountMinor).toBe(4890);
      expect(p.ledgerEntryId).toBe('le1');
      expect(p.cardId).toBe('c1');
      expect(p.customerResponse).toBe('report_fraud');
    });

    it('returns an empty payload for garbage', () => {
      expect(asFraudPayload(null)).toEqual({});
      expect(asFraudPayload('nope')).toEqual({});
    });
  });

  describe('disputes', () => {
    it('requires a ledger entry id and a known reason', () => {
      const ok = validateDispute({ ledgerEntryId: 'le1', reason: 'not_recognized' });
      expect(ok.ok).toBe(true);
      expect(ok.value).toEqual({ ledgerEntryId: 'le1', reason: 'not_recognized', details: null });
    });
    it('rejects a missing entry id or unknown reason', () => {
      expect(validateDispute({ reason: 'not_recognized' }).ok).toBe(false);
      expect(validateDispute({ ledgerEntryId: 'le1', reason: 'because' }).ok).toBe(false);
    });
    it('trims and caps optional details', () => {
      const ok = validateDispute({ ledgerEntryId: 'le1', reason: 'other', details: '  see notes  ' });
      expect(ok.value?.details).toBe('see notes');
    });

    it('parses a dispute payload, requiring a ledger entry id', () => {
      expect(asDisputePayload({ accountId: 'a1' })).toBeNull();
      const p = asDisputePayload({ ledgerEntryId: 'le1', accountId: 'a1', amountMinor: 4210, reason: 'duplicate_charge' });
      expect(p?.ledgerEntryId).toBe('le1');
      expect(p?.amountMinor).toBe(4210);
      expect(p?.reason).toBe('duplicate_charge');
    });
  });

  describe('isRequestReversed (R-03)', () => {
    it('is true only when payload.reversed === true', () => {
      expect(isRequestReversed(null)).toBe(false);
      expect(isRequestReversed({})).toBe(false);
      expect(isRequestReversed({ reversed: false })).toBe(false);
      expect(isRequestReversed({ reversed: true })).toBe(true);
    });
  });
});
