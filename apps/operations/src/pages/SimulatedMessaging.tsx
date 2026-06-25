import { useState } from 'react';
import {
  channelLabel,
  SIM_EVENT_CHANNELS,
  type SimEventChannel,
  type SimEventStatus,
} from '@simbank/shared';
import { ApiError } from '../lib/api';
import { useOpsData } from '../lib/ops-data-context';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { OpsActivityFeed } from '../components/OpsActivityFeed';

/** Per-channel defaults for the quick "success / failure" simulations. */
const CHANNEL_SETUP: Record<
  SimEventChannel,
  { description: string; kind: string; ok: SimEventStatus; fail: SimEventStatus }
> = {
  sms: { description: 'One-time passcodes & alerts', kind: 'otp', ok: 'delivered', fail: 'failed' },
  email: { description: 'Notifications & confirmations', kind: 'notification', ok: 'delivered', fail: 'failed' },
  mfa: { description: 'Step-up authentication', kind: 'challenge', ok: 'approved', fail: 'rejected' },
  identity: { description: 'Identity verification', kind: 'verification', ok: 'approved', fail: 'rejected' },
};

export function SimulatedMessaging() {
  const { events, simulate } = useOpsData();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(channel: SimEventChannel, ok: boolean) {
    const setup = CHANNEL_SETUP[channel];
    const outcome = ok ? setup.ok : setup.fail;
    setBusy(`${channel}:${ok}`);
    setError(null);
    try {
      await simulate({
        channel,
        kind: setup.kind,
        outcome,
        summary: `Simulated ${channelLabel(channel)} ${setup.kind} — ${outcome}`,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the simulated event.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Simulated messaging</h1>
        <p className="mt-1 text-sm text-slate-400">
          Generate fake external events to exercise the workflows. These are{' '}
          <span className="font-semibold text-amber-200">entirely simulated</span> — no real SMS,
          email, MFA, or identity provider is ever contacted.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SIM_EVENT_CHANNELS.map((channel) => {
          const setup = CHANNEL_SETUP[channel];
          return (
            <Card key={channel} className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{channelLabel(channel)}</div>
                <div className="text-xs text-slate-500">{setup.description}</div>
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5">
                <Button
                  variant="approve"
                  size="sm"
                  disabled={busy === `${channel}:true`}
                  onClick={() => send(channel, true)}
                >
                  Simulate {setup.ok}
                </Button>
                <Button
                  variant="reject"
                  size="sm"
                  disabled={busy === `${channel}:false`}
                  onClick={() => send(channel, false)}
                >
                  Simulate {setup.fail}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {error && <p className="text-sm text-rose-300/90">{error}</p>}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Simulated event feed
        </h2>
        <Card className="mt-3">
          <OpsActivityFeed events={events} emptyHint="No simulated events yet — send one above." />
        </Card>
      </section>
    </div>
  );
}
