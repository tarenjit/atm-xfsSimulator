'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAtmSocket } from '@/hooks/useAtmSocket';
import { useThemeMode } from '@/hooks/useThemeMode';
import type { FdkOption, VirtualCardSummary } from '@/types/atm';
import { HeaderBar } from './HeaderBar';
import { BankScreen } from './BankScreen';
import { KeypadPanel } from './KeypadPanel';
import { FdkColumn } from './FdkColumn';
import { CardSlot } from './CardSlot';
import { CashTray } from './CashTray';
import { ReceiptSlot } from './ReceiptSlot';

const WITHDRAW_FDKS: FdkOption[] = [
  { slot: 'FDK_A', label: '300.000', value: 300_000, enabled: true },
  { slot: 'FDK_B', label: '500.000', value: 500_000, enabled: true },
  { slot: 'FDK_C', label: 'UANG ELEKTRONIK', enabled: true },
  { slot: 'FDK_D', label: '', enabled: false },
  { slot: 'FDK_E', label: '1.000.000', value: 1_000_000, enabled: true },
  { slot: 'FDK_F', label: '2.000.000', value: 2_000_000, enabled: true },
  { slot: 'FDK_G', label: 'PENARIKAN\nJUMLAH LAIN', enabled: true },
  { slot: 'FDK_H', label: 'MENU LAINNYA', enabled: true },
];

/** Sub-menu reached via FDK_H "MENU LAINNYA". Layout matches typical Indonesian
 *  bank ATMs: balance + transfer on the active side, payment + deposit stubs.
 *  All clicks are handled client-side; balance dispatches to the existing
 *  BALANCE flow. Transfer / Payment / Deposit show a "coming soon" overlay
 *  for now (backend support is a future phase). */
const SUB_MENU_FDKS: FdkOption[] = [
  { slot: 'FDK_A', label: 'CEK SALDO', enabled: true },
  { slot: 'FDK_B', label: 'TRANSFER', enabled: true },
  { slot: 'FDK_C', label: 'SETOR TUNAI', enabled: true },
  { slot: 'FDK_D', label: '', enabled: false },
  { slot: 'FDK_E', label: 'PEMBAYARAN', enabled: true },
  { slot: 'FDK_F', label: '', enabled: false },
  { slot: 'FDK_G', label: '', enabled: false },
  { slot: 'FDK_H', label: 'KEMBALI', enabled: true },
];

export function AtmScreen() {
  const { connected, session, events, theme } = useAtmSocket();
  const { mode, toggle: toggleMode } = useThemeMode();
  const [cards, setCards] = useState<VirtualCardSummary[]>([]);
  const [selectedPan, setSelectedPan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [pinDigits, setPinDigits] = useState(0);
  const [pinBusy, setPinBusy] = useState(false);

  // Client-side menu view ('MAIN' is the standard withdrawal menu;
  // 'SUB' is the MENU LAINNYA sub-menu reached via FDK_H).
  const [menuView, setMenuView] = useState<'MAIN' | 'SUB'>('MAIN');
  // Modal overlay for "coming soon" + UANG ELEKTRONIK feedback. null = no overlay.
  const [overlayMsg, setOverlayMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ cards: VirtualCardSummary[] }>('/cards');
        if (!cancelled) {
          setCards(r.cards);
          // Pre-select the first ACTIVE card for fast demo insertion.
          const active = r.cards.find((c) => c.status === 'ACTIVE');
          if (active) setSelectedPan(active.pan);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
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

  const state = session?.state ?? 'IDLE';
  const cardInserted = state !== 'IDLE' && state !== 'ENDED';

  // Auto-start PIN entry the moment state enters PIN_ENTRY. Prevents the UX
  // trap where users type 1234 before the backend PIN buffer is open.
  // Ref-gate so StrictMode's double-invoke and sibling re-renders don't
  // fire the begin-pin POST twice for the same session.
  const autoPinStartedFor = useRef<string | null>(null);
  useEffect(() => {
    if (state !== 'PIN_ENTRY') return;
    if (!session?.id) return;
    if (autoPinStartedFor.current === session.id) return;
    autoPinStartedFor.current = session.id;
    setPinBusy(true);
    setPinDigits(0);
    (async () => {
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
    })();
  }, [state, session?.id]);

  // Reset the PIN-start gate when the session ends.
  useEffect(() => {
    if (!session) autoPinStartedFor.current = null;
  }, [session]);

  // --- Actions ---
  const insertCard = async () => {
    if (!selectedPan) {
      setError('select a card first');
      return;
    }
    await wrap(() =>
      api('/sessions/insert-card', {
        method: 'POST',
        body: JSON.stringify({ pan: selectedPan }),
      }),
    );
  };

  const pressKey = async (key: string) => {
    // Only hit the PIN pad endpoint when we're buffering PIN or amount.
    if (!pinBusy && !['CANCEL'].includes(key)) {
      // Outside PIN entry, CANCEL still maps to session cancel.
      if (key === 'CANCEL') {
        await wrap(() => api('/sessions/cancel', { method: 'POST', body: JSON.stringify({}) }));
      }
      return;
    }
    try {
      await api('/sessions/press-key', { method: 'POST', body: JSON.stringify({ key }) });
      if (key === 'CLEAR') setPinDigits(0);
      else if (key === 'CANCEL') {
        setPinDigits(0);
        setPinBusy(false);
      } else if (key === 'ENTER') setPinDigits(0);
      else if (/^[0-9]$/.test(key)) setPinDigits((n) => Math.min(n + 1, 12));
    } catch (e) {
      setError(String(e));
    }
  };

  const selectFdk = async (fdk: FdkOption) => {
    if (!fdk.enabled) return;
    if (state !== 'MAIN_MENU') return;

    // SUB_MENU view (reached via "MENU LAINNYA"): Cek Saldo / Transfer /
    // Pembayaran / Setor Tunai / Kembali.
    if (menuView === 'SUB') {
      switch (fdk.label) {
        case 'CEK SALDO':
          setMenuView('MAIN');
          await wrap(() =>
            api('/sessions/select-transaction', {
              method: 'POST',
              body: JSON.stringify({ txnType: 'BALANCE' }),
            }),
          );
          return;
        case 'TRANSFER':
          setOverlayMsg(
            'TRANSFER\n\nFitur ini sedang dalam pengembangan.\nSilakan gunakan layanan online banking Anda.',
          );
          return;
        case 'PEMBAYARAN':
          setOverlayMsg(
            'PEMBAYARAN\n\nFitur ini sedang dalam pengembangan.\nDijadwalkan rilis dalam pembaruan berikutnya.',
          );
          return;
        case 'SETOR TUNAI':
          setOverlayMsg(
            'SETOR TUNAI\n\nFitur ini sedang dalam pengembangan.\nSilakan gunakan ATM Setor Tarik (CRM) terdekat.',
          );
          return;
        case 'KEMBALI':
          setMenuView('MAIN');
          return;
      }
      return;
    }

    // MAIN view: standard withdrawal menu + the two new behaviours.
    if (fdk.label === 'UANG ELEKTRONIK') {
      setOverlayMsg(
        'UANG ELEKTRONIK\n\nSilakan tempelkan kartu uang elektronik Anda\n(Mandiri e-Money / Flazz / Brizzi / TapCash)\n\nMaaf, fitur ini belum tersedia di simulator.',
      );
      return;
    }
    if (fdk.label === 'MENU LAINNYA') {
      setMenuView('SUB');
      return;
    }
    if (typeof fdk.value === 'number') {
      // quick-amount withdrawal
      await wrap(async () => {
        await api('/sessions/select-transaction', {
          method: 'POST',
          body: JSON.stringify({ txnType: 'WITHDRAWAL' }),
        });
        await api('/sessions/submit-amount', {
          method: 'POST',
          body: JSON.stringify({ amount: fdk.value }),
        });
      });
      return;
    }
    if (fdk.label.includes('JUMLAH LAIN')) {
      await wrap(() =>
        api('/sessions/select-transaction', {
          method: 'POST',
          body: JSON.stringify({ txnType: 'WITHDRAWAL' }),
        }),
      );
      return;
    }
  };

  // Reset client-side view + overlay when session ends or restarts.
  useEffect(() => {
    if (state === 'IDLE' || state === 'ENDED') {
      setMenuView('MAIN');
      setOverlayMsg(null);
    }
  }, [state]);

  const submitCustomAmount = async () => {
    const v = parseInt(customAmount, 10);
    if (!Number.isFinite(v)) return;
    await wrap(() =>
      api('/sessions/submit-amount', {
        method: 'POST',
        body: JSON.stringify({ amount: v }),
      }),
    );
    setCustomAmount('');
  };

  const cancelSession = () =>
    wrap(() => api('/sessions/cancel', { method: 'POST', body: JSON.stringify({}) }));

  const confirmSession = () =>
    wrap(() => api('/sessions/confirm', { method: 'POST', body: JSON.stringify({}) }));

  const balanceInquiry = () =>
    wrap(() =>
      api('/sessions/select-transaction', {
        method: 'POST',
        body: JSON.stringify({ txnType: 'BALANCE' }),
      }),
    );

  // Compute the FDK layout per current state + current menu view.
  const fdks: FdkOption[] = useMemo(() => {
    if (state === 'MAIN_MENU') {
      return menuView === 'SUB' ? SUB_MENU_FDKS : WITHDRAW_FDKS;
    }
    return [
      { slot: 'FDK_A', label: '', enabled: false },
      { slot: 'FDK_B', label: '', enabled: false },
      { slot: 'FDK_C', label: '', enabled: false },
      { slot: 'FDK_D', label: '', enabled: false },
      { slot: 'FDK_E', label: '', enabled: false },
      { slot: 'FDK_F', label: '', enabled: false },
      { slot: 'FDK_G', label: '', enabled: false },
      { slot: 'FDK_H', label: '', enabled: false },
    ];
  }, [state, menuView]);

  const primary = theme?.primaryColor ?? '#0F172A';
  const accent = theme?.accentColor ?? '#FFFFFF';

  return (
    <div className="min-h-screen flex flex-col chrome-bg">
      <HeaderBar
        deploymentName={theme?.name ?? 'Zegen'}
        atmName="Zegen Virtual ATM"
        atmIp="127.0.0.1"
        vendor="Hyosung"
        model="ATM"
        connected={connected}
        state={state}
        mode={mode}
        onToggleMode={toggleMode}
      />

      <main className="flex-1 flex flex-col xl:flex-row gap-6 p-6 max-w-7xl w-full mx-auto">
        {/* Left column: virtual ATM panel with dark fascia */}
        <section className="flex-1 space-y-6">
          <div className="fascia border rounded-2xl p-4 shadow-2xl">
            {/* Blue screen + FDK columns */}
            <div className="flex items-stretch gap-2">
              <FdkColumn side="left" fdks={fdks.slice(0, 4)} onPress={selectFdk} />
              <BankScreen
                primaryColor={primary}
                accentColor={accent}
                theme={theme}
                session={session}
                cards={cards}
                selectedPan={selectedPan}
                onPickCard={setSelectedPan}
                pinDigits={pinDigits}
                customAmount={customAmount}
                onCustomAmountChange={setCustomAmount}
                menuView={menuView}
                overlayMsg={overlayMsg}
                onDismissOverlay={() => setOverlayMsg(null)}
              />
              <FdkColumn side="right" fdks={fdks.slice(4, 8)} onPress={selectFdk} />
            </div>

            {/* Card slot */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              <CardSlot cardInserted={cardInserted} />
              <div />
              <ReceiptSlot />
            </div>

            {/* Keypad + cash tray */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 flex justify-center">
                <KeypadPanel onKey={pressKey} />
              </div>
              <CashTray active={state === 'DISPENSING' || state === 'EJECTING'} />
            </div>
          </div>
        </section>

        {/* Right column: context panel (action controls for current state) */}
        <aside className="w-full xl:w-80 space-y-4">
          <div className="chrome-surface border rounded-xl p-4 space-y-3">
            <h2 className="text-xs uppercase tracking-widest chrome-dim">Session</h2>
            <dl className="text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <dt className="chrome-muted">state</dt>
                <dd className="text-zegen-accent">{state}</dd>
              </div>
              {session?.id && (
                <div className="flex justify-between">
                  <dt className="chrome-muted">id</dt>
                  <dd className="chrome-text truncate ml-4">{session.id}</dd>
                </div>
              )}
              {session?.amount && (
                <div className="flex justify-between">
                  <dt className="chrome-muted">amount</dt>
                  <dd className="chrome-text">Rp {session.amount.toLocaleString('id-ID')}</dd>
                </div>
              )}
              {session?.errorMessage && (
                <div className="text-red-400 mt-2 whitespace-pre-wrap">{session.errorMessage}</div>
              )}
            </dl>
          </div>

          {/* State-sensitive action buttons */}
          <div className="chrome-surface border rounded-xl p-4 space-y-3">
            <h2 className="text-xs uppercase tracking-widest chrome-dim">Actions</h2>

            {state === 'IDLE' && (
              <>
                <div className="text-xs chrome-muted">
                  Pick a virtual card, then press <span className="text-zegen-accent">Insert</span>.
                </div>
                <select
                  value={selectedPan ?? ''}
                  onChange={(e) => setSelectedPan(e.target.value)}
                  className="w-full chrome-surface-2 border rounded px-2 py-1 text-xs chrome-text"
                >
                  {cards.length === 0 && <option value="">loading…</option>}
                  {cards.map((c) => (
                    <option key={c.pan} value={c.pan}>
                      {c.pan} — {c.cardholderName} ({c.status})
                    </option>
                  ))}
                </select>
                <button
                  disabled={!selectedPan || busy}
                  onClick={insertCard}
                  className="w-full py-2 rounded bg-zegen-accent text-slate-900 font-medium text-sm disabled:opacity-40"
                >
                  {busy ? 'Inserting…' : 'Insert card'}
                </button>
              </>
            )}

            {state === 'PIN_ENTRY' && (
              <div className="text-xs chrome-muted space-y-1">
                <div>
                  Enter PIN on the keypad. Press <span className="text-zegen-accent">ENTER</span> to
                  submit, <span className="text-red-500">CANCEL</span> to abort.
                </div>
                <div className="chrome-dim">
                  (demo PIN for all seeded cards: <span className="font-mono">111111</span>)
                </div>
              </div>
            )}

            {state === 'MAIN_MENU' && (
              <button onClick={balanceInquiry} className="w-full py-2 rounded key-digit text-sm">
                Balance inquiry
              </button>
            )}

            {state === 'AMOUNT_ENTRY' && (
              <div className="space-y-2">
                <input
                  type="number"
                  step={20_000}
                  min={20_000}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full chrome-surface-2 border rounded px-2 py-1 text-sm chrome-text"
                  placeholder="Amount (×20,000)"
                />
                <button
                  onClick={submitCustomAmount}
                  disabled={!customAmount}
                  className="w-full py-2 rounded bg-zegen-accent text-slate-900 font-medium text-sm disabled:opacity-40"
                >
                  Submit amount
                </button>
              </div>
            )}

            {state === 'CONFIRM' && (
              <div className="space-y-2">
                <div className="text-center text-lg font-semibold">
                  Rp {session?.amount?.toLocaleString('id-ID')}
                </div>
                <button
                  onClick={confirmSession}
                  className="w-full py-2 rounded bg-zegen-accent text-slate-900 font-medium text-sm"
                >
                  Confirm
                </button>
              </div>
            )}

            {['PROCESSING', 'DISPENSING', 'PRINTING', 'EJECTING'].includes(state) && (
              <div className="flex items-center gap-2 text-sm chrome-muted">
                <span className="w-3 h-3 border-2 border-zegen-accent border-t-transparent rounded-full animate-spin" />
                {state.toLowerCase()}…
              </div>
            )}

            {['PIN_ENTRY', 'MAIN_MENU', 'AMOUNT_ENTRY', 'CONFIRM'].includes(state) && (
              <button
                onClick={cancelSession}
                className="w-full py-2 rounded bg-red-600 text-white text-sm"
              >
                Cancel session
              </button>
            )}

            {error && (
              <div className="mt-2 p-2 text-xs rounded bg-red-500/10 border border-red-500/40 text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="chrome-surface border rounded-xl p-4 space-y-2">
            <h2 className="text-xs uppercase tracking-widest chrome-dim">Live events</h2>
            <div className="max-h-40 overflow-y-auto font-mono text-xs space-y-0.5">
              {events.slice(0, 20).map((e, i) => (
                <div key={i} className="flex gap-2">
                  <span className="chrome-dim shrink-0">
                    {new Date(e.timestamp).toLocaleTimeString('id-ID')}
                  </span>
                  <span
                    className={cn(
                      'truncate',
                      e.eventClass === 'EXEE' ? 'text-amber-300' : 'text-cyan-300',
                    )}
                  >
                    {e.eventCode}
                  </span>
                </div>
              ))}
              {events.length === 0 && <div className="chrome-dim">no events yet</div>}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
