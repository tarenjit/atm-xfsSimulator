'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

type HostTransportKind = 'IN_PROCESS' | 'ISO8583_TCP' | 'ISO20022_HTTP';
type SwitchProfile = 'JALIN' | 'ATM_BERSAMA' | 'PRIMA' | 'BIFAST';

interface RuntimeStatus {
  kind: HostTransportKind;
  configId: string;
  listening: boolean;
  bindAddress: string;
  port: number;
  switchProfile: SwitchProfile;
  activeConnections: number;
  totalRequests: number;
  startedAt: string | null;
  lastError: string | null;
}

interface TransportConfig {
  id: string;
  name: string;
  kind: HostTransportKind;
  bindAddress: string;
  port: number;
  switchProfile: SwitchProfile;
  tlsEnabled: boolean;
  enabled: boolean;
  isPrimary: boolean;
  notes: string | null;
  status: RuntimeStatus;
}

const KIND_LABEL: Record<HostTransportKind, string> = {
  IN_PROCESS: 'In-process (default)',
  ISO8583_TCP: 'ISO 8583 over TCP',
  ISO20022_HTTP: 'ISO 20022 XML over HTTP',
};

/**
 * Operator-facing panel for the host-transport toggle (Phase 7.1).
 *
 * Lists every configured transport, shows its live status, and lets the
 * operator start / stop / activate one of each kind. "Activate" stops every
 * other transport of the same kind first — the radio-toggle behaviour the
 * real-deployment story needs.
 */
export function HostTransportPanel() {
  const [transports, setTransports] = useState<TransportConfig[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ transports: TransportConfig[] }>('/host-transport');
      setTransports(r.transports);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const act = async (id: string, action: 'start' | 'stop' | 'activate') => {
    setBusyId(id);
    try {
      await api(`/host-transport/${id}/${action}`, { method: 'POST' });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <section className="rounded-lg p-4 chrome-panel">
        <h2 className="text-sm uppercase tracking-widest text-zegen-accent mb-2">Host transport</h2>
        <div className="text-xs chrome-dim">Loading…</div>
      </section>
    );
  }

  return (
    <section className="rounded-lg p-4 chrome-panel space-y-3">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="text-sm uppercase tracking-widest text-zegen-accent">Host transport</h2>
          <p className="text-xs chrome-dim mt-1">
            Toggle how the simulated host receives ATM messages. In-process is the default; flip
            to ISO 8583 TCP or ISO 20022 XML to match the wire protocol the customer&apos;s
            middleware expects.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-2">
        {transports.map((t) => {
          const live = t.status;
          const dot = live.listening
            ? 'bg-emerald-400'
            : t.enabled
              ? 'bg-amber-400'
              : 'bg-zinc-500';
          return (
            <div
              key={t.id}
              className="rounded border chrome-border p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className={cn('w-2.5 h-2.5 rounded-full mt-1', dot)} />
                <div>
                  <div className="text-sm font-medium chrome-text">
                    {t.name}
                    {t.isPrimary && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-zegen-accent">
                        primary
                      </span>
                    )}
                  </div>
                  <div className="text-xs chrome-dim">
                    {KIND_LABEL[t.kind]} · {t.kind === 'IN_PROCESS' ? '—' : `${t.bindAddress}:${t.port}`} · switch={t.switchProfile}
                  </div>
                  {t.notes && <div className="text-[11px] chrome-dim mt-1 italic">{t.notes}</div>}
                  <div className="text-[11px] chrome-dim mt-1">
                    {live.listening
                      ? `listening · ${live.activeConnections} active conn · ${live.totalRequests} total reqs`
                      : 'stopped'}
                    {live.lastError && (
                      <span className="ml-2 text-red-300">last error: {live.lastError}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!t.enabled && (
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => act(t.id, 'activate')}
                    className="px-3 py-1.5 text-xs rounded chrome-btn"
                  >
                    Activate (radio)
                  </button>
                )}
                {!t.enabled ? (
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => act(t.id, 'start')}
                    className="px-3 py-1.5 text-xs rounded chrome-btn"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => act(t.id, 'stop')}
                    className="px-3 py-1.5 text-xs rounded chrome-btn"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
