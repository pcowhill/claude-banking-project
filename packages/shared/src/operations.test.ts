import { describe, it, expect } from 'vitest';
import { OPS_REQUEST_STATUSES, OPS_REQUEST_TYPES } from './types';
import {
  OPS_ACTIONS,
  OPS_ACTION_LABELS,
  OPS_ACTION_RESULT,
  OPS_NOTE_ACTION,
  OPS_QUEUES,
  OPS_REQUEST_PRIORITIES,
  OPS_REQUEST_STATUS_LABELS,
  OPS_REQUEST_TYPE_LABELS,
  SIM_EVENT_CHANNELS,
  SIM_EVENT_CHANNEL_LABELS,
  TERMINAL_OPS_STATUSES,
  canApplyAction,
  channelLabel,
  countRequestsByStatus,
  isDecisionAction,
  isOpsAction,
  isSimEventChannel,
  isTerminalOpsStatus,
  nextStatusForAction,
  opsActionLabel,
  opsStatusLabel,
  opsTypeLabel,
  queueForType,
  type OperationsRequestDTO,
} from './operations';

describe('nextStatusForAction', () => {
  it('maps each action to its resolved status', () => {
    expect(nextStatusForAction('approve')).toBe('approved');
    expect(nextStatusForAction('reject')).toBe('rejected');
    expect(nextStatusForAction('hold')).toBe('on_hold');
    expect(nextStatusForAction('request_info')).toBe('info_requested');
  });

  it('agrees with the OPS_ACTION_RESULT table for every action', () => {
    for (const action of OPS_ACTIONS) {
      expect(nextStatusForAction(action)).toBe(OPS_ACTION_RESULT[action]);
    }
  });

  it('only ever produces a known status', () => {
    for (const action of OPS_ACTIONS) {
      expect(OPS_REQUEST_STATUSES).toContain(nextStatusForAction(action));
    }
  });
});

describe('isTerminalOpsStatus', () => {
  it('treats approved and rejected as terminal', () => {
    expect(isTerminalOpsStatus('approved')).toBe(true);
    expect(isTerminalOpsStatus('rejected')).toBe(true);
  });

  it('treats pending, on_hold and info_requested as still actionable', () => {
    expect(isTerminalOpsStatus('pending')).toBe(false);
    expect(isTerminalOpsStatus('on_hold')).toBe(false);
    expect(isTerminalOpsStatus('info_requested')).toBe(false);
  });

  it('only lists known statuses as terminal', () => {
    for (const status of TERMINAL_OPS_STATUSES) {
      expect(OPS_REQUEST_STATUSES).toContain(status);
    }
  });
});

describe('canApplyAction', () => {
  it('allows any action while the request is not resolved', () => {
    expect(canApplyAction('pending', 'approve')).toBe(true);
    expect(canApplyAction('on_hold', 'approve')).toBe(true);
    expect(canApplyAction('info_requested', 'reject')).toBe(true);
  });

  it('blocks every action once the request is terminal', () => {
    for (const action of OPS_ACTIONS) {
      expect(canApplyAction('approved', action)).toBe(false);
      expect(canApplyAction('rejected', action)).toBe(false);
    }
  });
});

describe('type guards', () => {
  it('isOpsAction accepts known actions and rejects everything else', () => {
    expect(isOpsAction('approve')).toBe(true);
    expect(isOpsAction('hold')).toBe(true);
    expect(isOpsAction('explode')).toBe(false);
    expect(isOpsAction(undefined)).toBe(false);
    expect(isOpsAction(42)).toBe(false);
  });

  it('isSimEventChannel accepts known channels and rejects everything else', () => {
    expect(isSimEventChannel('sms')).toBe(true);
    expect(isSimEventChannel('identity')).toBe(true);
    expect(isSimEventChannel('carrier-pigeon')).toBe(false);
    expect(isSimEventChannel(null)).toBe(false);
  });
});

describe('display labels', () => {
  it('has a label for every request type, status, action, and channel', () => {
    for (const type of OPS_REQUEST_TYPES) {
      expect(OPS_REQUEST_TYPE_LABELS[type]).toBeTruthy();
    }
    for (const status of OPS_REQUEST_STATUSES) {
      expect(OPS_REQUEST_STATUS_LABELS[status]).toBeTruthy();
    }
    for (const action of OPS_ACTIONS) {
      expect(OPS_ACTION_LABELS[action]).toBeTruthy();
    }
    for (const channel of SIM_EVENT_CHANNELS) {
      expect(SIM_EVENT_CHANNEL_LABELS[channel]).toBeTruthy();
    }
  });

  it('accessor helpers return the mapped label', () => {
    expect(opsTypeLabel('identity_verification')).toBe('Identity verification');
    expect(opsStatusLabel('on_hold')).toBe('On hold');
    expect(opsActionLabel('request_info')).toBe('Request info');
    expect(channelLabel('mfa')).toBe('MFA');
  });

  it('accessor helpers fall back to the raw value for unknown input', () => {
    // Cast through unknown to exercise the defensive fallback branch.
    expect(opsTypeLabel('mystery' as never)).toBe('mystery');
    expect(channelLabel('telepathy' as never)).toBe('telepathy');
  });
});

describe('queues', () => {
  it('maps every known request type into exactly one queue lane', () => {
    for (const type of OPS_REQUEST_TYPES) {
      const lanes = OPS_QUEUES.filter((q) => q.types.includes(type));
      expect(lanes).toHaveLength(1);
      expect(queueForType(type)).toBe(lanes[0].key);
    }
  });

  it('returns "other" for an unmapped type', () => {
    expect(queueForType('mystery' as never)).toBe('other');
  });
});

describe('enum completeness', () => {
  it('exposes the expected action and priority sets', () => {
    expect([...OPS_ACTIONS]).toEqual(['approve', 'reject', 'hold', 'request_info']);
    expect([...OPS_REQUEST_PRIORITIES]).toEqual(['low', 'normal', 'high']);
  });
});

describe('note action (v0.6.0)', () => {
  it('is NOT one of the four decision actions (never a fifth decision button)', () => {
    expect(OPS_ACTIONS as readonly string[]).not.toContain(OPS_NOTE_ACTION);
  });

  it('isOpsAction accepts note; isDecisionAction rejects it', () => {
    expect(isOpsAction('note')).toBe(true);
    expect(isDecisionAction('note')).toBe(false);
    expect(isDecisionAction('approve')).toBe(true);
  });

  it('does not change status (nextStatusForAction is null)', () => {
    expect(nextStatusForAction('note')).toBeNull();
  });

  it('is allowed at any time, including on a terminal request', () => {
    expect(canApplyAction('pending', 'note')).toBe(true);
    expect(canApplyAction('approved', 'note')).toBe(true);
    expect(canApplyAction('rejected', 'note')).toBe(true);
  });

  it('has a display label', () => {
    expect(opsActionLabel('note')).toBe('Add note');
    expect(OPS_ACTION_LABELS.note).toBe('Add note');
  });
});

describe('countRequestsByStatus', () => {
  const req = (status: OperationsRequestDTO['status']): Pick<OperationsRequestDTO, 'status'> => ({
    status,
  });

  it('returns a full record with zeros when empty', () => {
    const counts = countRequestsByStatus([]);
    for (const status of OPS_REQUEST_STATUSES) {
      expect(counts[status]).toBe(0);
    }
  });

  it('tallies counts per status', () => {
    const counts = countRequestsByStatus([
      req('pending'),
      req('pending'),
      req('on_hold'),
      req('approved'),
    ]);
    expect(counts.pending).toBe(2);
    expect(counts.on_hold).toBe(1);
    expect(counts.approved).toBe(1);
    expect(counts.rejected).toBe(0);
    expect(counts.info_requested).toBe(0);
  });
});
