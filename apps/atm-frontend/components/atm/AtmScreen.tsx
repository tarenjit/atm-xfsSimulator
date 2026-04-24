'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { CardPicker } from './CardPicker';
import { PinPad } from './PinPad';
import { useAtmSocket } from '@/hooks/useAtmSocket';
import type { AtmSession, AtmTxnType } from '@/types/atm';

const QUICK_AMOUNTS = [100_000, 200_000, 500_000, 1_000_000, 2_000_000];

export function AtmScreen() {
  const { connected, session, events } = useAtmSocket();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const [pinDigits, setPinDigits] = useState(0);
  const [pinBusy, setPinBusy] = useState(false);

  // Hydrate initial session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ session: AtmSession | null }>('/sessions/current');
        if (!cancelled && data.session) {
          // the socket will also push, but this shortens the gap.
        }
      } catch {
        /* backend not up yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const wrap = useCallback(async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const pressKey = async (key: string) => {
    try {
      await api('/sessions/press-key', { method: 'POST', body: JSON.stringify({ key }) });
      if (key === 'CLEAR') setPinDigits(0);
      else if (key === 'CANCEL') setPinDigits(0);
      else if (key === 'ENTER') setPinDigits(0);
      else if (/^[0-9]$/.test(key)) setPinDigits((n) => Math.min(n + 1, 12));
    } catch (e) {
      setError(String(e));
    }
  };

  const startPin = async () => {
    setPinBusy(true);
    setPinDigits(0);
    try {
      const r = await api<{ verified: boolean; reason?: string }>('/sessions/begin-pin', {
        method: 'POST',
        timeoutMs: 75_000,
      });
      if (!r.verified && r.reason) setError(r.reason);
    } catch (e) {
      setError(String(e));
    } finally {
      setPinBusy(false);
    }
  };

  const state = session?.state ?? 'IDLE';

  return (
    <div className="min-h-screen flex flex-col">
      <Header connected={connected} state={state} />

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl bg-slate-900/70 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          {state === 'IDLE' && <IdlePanel />}
          {state === 'IDLE' && !session && <CardPicker onInserted={() => { /* socket will update */ }} />}

          {state === 'CARD_INSERTED' && (
            <Message heading="Reading card…" sub="Please wait." />
          )}

          {state === 'PIN_ENTRY' && (
            <div className="space-y-6">
              <Message heading="Enter your PIN" sub="Use the keypad or your keyboard." />
              <div className="flex justify-center gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'w-6 h-6 rounded-full border',
                      i < pinDigits ? 'bg-zegen-accent border-zegen-accent' : 'border-slate-600',
                    )}
                  />
                ))}
              </div>
              {!pinBusy && (
                <div className="flex justify-center">
                  <Button onClick={() => wrap(startPin)}>Start PIN entry</Button>
                </div>
              )}
              {pinBusy && (
                <div className="flex justify-center">
                  <PinPad onKey={pressKey} />
                </div>
              )}
            </div>
          )}

          {state === 'PIN_VERIFIED' && <Message heading="PIN verified" sub="Opening menu…" />}

          {state === 'MAIN_MENU' && (
            <div className="space-y-4">
              <Message heading="What would you like to do?" />
              <div className="grid grid-cols-2 gap-3">
                {(['WITHDRAWAL', 'BALANCE'] as AtmTxnType[]).map((txn) => (
                  <Button
                    key={txn}
                    size="lg"
                    onClick={() =>
                      wrap(() =>
                        api('/sessions/select-transaction', {
                          method: 'POST',
                          body: JSON.stringify({ txnType: txn }),
                        }),
                      )
                    }
                  >
                    {txn === 'WITHDRAWAL' ? 'Cash Withdrawal' : 'Balance Inquiry'}
                  </Button>
                ))}
              </div>
              <div className="flex justify-center pt-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    wrap(() => api('/sessions/cancel', { method: 'POST', body: JSON.stringify({}) }))
                  }
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {state === 'AMOUNT_ENTRY' && (
            <div className="space-y-4">
              <Message heading="How much cash?" sub="Amount must be a multiple of Rp 20,000." />
              <div className="grid grid-cols-3 gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <Button
                    key={a}
                    variant="secondary"
                    onClick={() =>
                      wrap(() =>
                        api('/sessions/submit-amount', {
                          method: 'POST',
                          body: JSON.stringify({ amount: a }),
                        }),
                      )
                    }
                  >
                    {a.toLocaleString('id-ID')}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step={20_000}
                  min={20_000}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2"
                  placeholder="Custom amount"
                />
                <Button
                  onClick={() => {
                    const v = parseInt(amount, 10);
                    if (Number.isFinite(v))
                      wrap(() =>
                        api('/sessions/submit-amount', {
                          method: 'POST',
                          body: JSON.stringify({ amount: v }),
                        }),
                      );
                  }}
                >
                  Submit
                </Button>
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  wrap(() => api('/sessions/cancel', { method: 'POST', body: JSON.stringify({}) }))
                }
              >
                Cancel
              </Button>
            </div>
          )}

          {state === 'CONFIRM' && session && (
            <div className="space-y-4 text-center">
              <Message heading="Confirm withdrawal" />
              <div className="text-3xl font-semibold">
                Rp {session.amount?.toLocaleString('id-ID')}
              </div>
              <div className="flex gap-3 justify-center">
                <Button
                  size="lg"
                  onClick={() =>
                    wrap(() => api('/sessions/confirm', { method: 'POST', body: JSON.stringify({}) }))
                  }
                >
                  Confirm
                </Button>
                <Button
                  size="lg"
                  variant="danger"
                  onClick={() =>
                    wrap(() => api('/sessions/cancel', { method: 'POST', body: JSON.stringify({}) }))
                  }
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {state === 'PROCESSING' && <Spinner label="Authorising with your bank…" />}
          {state === 'DISPENSING' && <Spinner label="Dispensing cash…" />}
          {state === 'PRINTING' && <Spinner label="Printing receipt…" />}
          {state === 'EJECTING' && <Spinner label="Please take your card." />}

          {state === 'ERROR' && (
            <Message
              heading="Something went wrong"
              sub={session?.errorMessage ?? 'Please try again.'}
              tone="error"
            />
          )}

          {state === 'ENDED' && <Message heading="Thank you" sub="Please take your card and cash." />}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm">
              {error}
            </div>
          )}

          {busy && (
            <div className="mt-4 text-xs text-slate-500 text-center">Working…</div>
          )}
        </div>
      </main>

      <EventStrip events={events.slice(0, 3)} />
    </div>
  );
}

function IdlePanel() {
  return (
    <div className="text-center mb-6">
      <div className="text-xs uppercase tracking-widest text-zegen-accent mb-2">ATM terminal</div>
      <h1 className="text-2xl font-semibold">Please insert your card</h1>
      <p className="text-sm text-slate-400 mt-2">
        This is a simulator. Choose a virtual card below to begin.
      </p>
    </div>
  );
}

function Message({
  heading,
  sub,
  tone = 'neutral',
}: {
  heading: string;
  sub?: string;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div className="text-center">
      <h2 className={cn('text-2xl font-semibold', tone === 'error' && 'text-red-300')}>{heading}</h2>
      {sub && <p className="text-slate-400 mt-2">{sub}</p>}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="w-10 h-10 border-4 border-zegen-accent border-t-transparent rounded-full animate-spin" />
      <div className="text-slate-300">{label}</div>
    </div>
  );
}

function Header({ connected, state }: { connected: boolean; state: string }) {
  return (
    <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between text-xs">
      <div className="font-mono text-slate-400">
        state: <span className="text-zegen-accent">{state}</span>
      </div>
      <div
        className={cn(
          'flex items-center gap-2',
          connected ? 'text-green-400' : 'text-red-400',
        )}
      >
        <span className="w-2 h-2 rounded-full bg-current" />
        {connected ? 'connected' : 'disconnected'}
      </div>
    </header>
  );
}

function EventStrip({ events }: { events: { eventCode: string; timestamp: string }[] }) {
  if (events.length === 0) return null;
  return (
    <div className="border-t border-slate-800 p-3 text-xs text-slate-500 flex gap-3 overflow-x-auto">
      <span className="text-slate-600 shrink-0">events:</span>
      {events.map((e, i) => (
        <span key={i} className="font-mono whitespace-nowrap">
          {e.eventCode}
        </span>
      ))}
    </div>
  );
}
