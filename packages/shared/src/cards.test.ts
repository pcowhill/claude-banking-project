import { describe, expect, it } from 'vitest';
import {
  canAddTravelNotice,
  canFreezeCard,
  canReportCard,
  canUnfreezeCard,
  formatCardExpiry,
  isTerminalCardStatus,
  maskedCardNumber,
  validateIssueCard,
  validateReportCard,
  validateTravelNotice,
} from './cards';

/**
 * The card contract is pure and shared by the customer form and the backend, so
 * these tests pin down the lifecycle guards and the field-level validation that
 * both sides rely on. A card MOVES NO MONEY — there is nothing ledger-related to
 * test here, only its lifecycle + display.
 */
describe('cards contract (v0.8.0)', () => {
  describe('status guards', () => {
    it('marks lost/stolen/replaced/cancelled as terminal', () => {
      expect(isTerminalCardStatus('active')).toBe(false);
      expect(isTerminalCardStatus('frozen')).toBe(false);
      for (const s of ['lost', 'stolen', 'replaced', 'cancelled'] as const) {
        expect(isTerminalCardStatus(s)).toBe(true);
      }
    });

    it('only freezes an active card and only unfreezes a frozen one', () => {
      expect(canFreezeCard('active')).toBe(true);
      expect(canFreezeCard('frozen')).toBe(false);
      expect(canUnfreezeCard('frozen')).toBe(true);
      expect(canUnfreezeCard('active')).toBe(false);
    });

    it('allows reporting + travel notices only on an in-service card', () => {
      expect(canReportCard('active')).toBe(true);
      expect(canReportCard('frozen')).toBe(true);
      expect(canReportCard('lost')).toBe(false);
      expect(canAddTravelNotice('active')).toBe(true);
      expect(canAddTravelNotice('cancelled')).toBe(false);
    });
  });

  describe('display helpers', () => {
    it('masks all but the last four', () => {
      expect(maskedCardNumber('1234')).toBe('•••• •••• •••• 1234');
    });
    it('zero-pads MM/YY expiry', () => {
      expect(formatCardExpiry(3, 2029)).toBe('03/29');
      expect(formatCardExpiry(12, 2031)).toBe('12/31');
    });
  });

  describe('validateIssueCard', () => {
    it('requires a valid card type and defaults the network to visa', () => {
      const ok = validateIssueCard({ cardType: 'debit' });
      expect(ok.ok).toBe(true);
      expect(ok.value).toEqual({ cardType: 'debit', network: 'visa' });
    });
    it('accepts an explicit valid network', () => {
      const ok = validateIssueCard({ cardType: 'credit', network: 'mastercard' });
      expect(ok.value?.network).toBe('mastercard');
    });
    it('rejects an unknown type or network', () => {
      expect(validateIssueCard({ cardType: 'gift' }).ok).toBe(false);
      expect(validateIssueCard({ cardType: 'debit', network: 'amex' }).ok).toBe(false);
    });
  });

  describe('validateReportCard', () => {
    it('accepts lost or stolen and rejects anything else', () => {
      expect(validateReportCard({ reason: 'lost' }).ok).toBe(true);
      expect(validateReportCard({ reason: 'stolen' }).ok).toBe(true);
      expect(validateReportCard({ reason: 'eaten' }).ok).toBe(false);
    });
  });

  describe('validateTravelNotice', () => {
    it('requires a destination and a valid date range', () => {
      const ok = validateTravelNotice({ destination: 'Lisbon', startsOn: '2026-07-01', endsOn: '2026-07-10' });
      expect(ok.ok).toBe(true);
      expect(ok.value?.destination).toBe('Lisbon');
    });
    it('rejects an end date before the start date', () => {
      const bad = validateTravelNotice({ destination: 'Lisbon', startsOn: '2026-07-10', endsOn: '2026-07-01' });
      expect(bad.ok).toBe(false);
      expect(bad.errors.endsOn).toBeTruthy();
    });
    it('rejects a missing destination or malformed date', () => {
      expect(validateTravelNotice({ destination: '', startsOn: '2026-07-01', endsOn: '2026-07-10' }).ok).toBe(false);
      expect(validateTravelNotice({ destination: 'X', startsOn: 'soon', endsOn: '2026-07-10' }).ok).toBe(false);
    });
  });
});
