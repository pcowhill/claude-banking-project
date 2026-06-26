import {
  OPS_ACTIONS,
  isTerminalOpsStatus,
  opsActionLabel,
  type OpsAction,
  type OpsDecisionAction,
  type OpsRequestStatus,
} from '@simbank/shared';
import { Button } from './ui/Button';

// Variants for the DECISION actions only (`OPS_ACTIONS`); the non-decision
// `note` action is handled separately in the detail panel, not on this bar.
const ACTION_VARIANT: Record<OpsDecisionAction, 'approve' | 'reject' | 'hold' | 'ghost'> = {
  approve: 'approve',
  reject: 'reject',
  hold: 'hold',
  request_info: 'ghost',
};

/**
 * The operator action buttons (approve / reject / hold / request info). Disabled
 * once the request is resolved (terminal status) or while an action is in flight.
 */
export function ActionBar({
  status,
  busy,
  size = 'sm',
  onAction,
}: {
  status: OpsRequestStatus;
  busy?: boolean;
  size?: 'sm' | 'md';
  onAction: (action: OpsAction) => void;
}) {
  const resolved = isTerminalOpsStatus(status);
  return (
    <div className="flex flex-wrap gap-1.5">
      {OPS_ACTIONS.map((action) => (
        <Button
          key={action}
          variant={ACTION_VARIANT[action]}
          size={size}
          disabled={resolved || busy}
          onClick={() => onAction(action)}
        >
          {opsActionLabel(action)}
        </Button>
      ))}
    </div>
  );
}
