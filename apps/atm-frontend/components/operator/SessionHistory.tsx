'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Session {
  id: string;
  state: string;
  pan?: string | null;
  accountId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  endReason?: string | null;
}

interface CommandRow {
  id: string;
  hService: string;
  commandCode: string;
  result: number | null;
  errorDetail: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface TransactionRow {
  id: string;
  txnType: string;
  amount: string | number;
  currency: string;
  status: string;
  stanNo: string | null;
  authCode: string | null;
  responseCode: string | null;
  errorReason: string | null;
  createdAt: string;
}

interface ReplayResponse {
  session: Session | null;
  commands: CommandRow[];
  transactions: TransactionRow[];
}

export function SessionHistory() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [loadingReplay, setLoadingReplay] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ sessions: Session[] }>('/logs/sessions?limit=30');
      setSessions(r.sessions);
    } catch {
      /* ignore; surface via network tab */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, [load]);

  const openSession = async (id: string) => {
    setOpenId(id);
    setReplay(null);
    setLoadingReplay(true);
    try {
      const r = await api<ReplayResponse>(`/logs/sessions/${id}/replay`);
      setReplay(r);
    } finally {
      setLoadingReplay(false);
    }
  };

  const close = () => {
    setOpenId(null);
    setReplay(null);
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
        Session history
      </h2>
      <div className="border border-slate-800 bg-slate-950/60 rounded-lg divide-y divide-slate-800">
        {sessions.length === 0 ? (
          <div className="p-3 text-xs text-slate-600">no sessions yet</div>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => openSession(s.id)}
              className="w-full p-3 text-left text-xs flex items-center gap-3 hover:bg-slate-900/60 transition-colors"
            >
              <span className="text-slate-500 font-mono shrink-0">
                {new Date(s.startedAt).toLocaleTimeString('id-ID')}
              </span>
              <span className="font-mono text-slate-400 shrink-0">{s.id.slice(0, 14)}…</span>
              {s.pan && (
                <span className="font-mono text-slate-500 shrink-0">
                  ****{s.pan.slice(-4)}
                </span>
              )}
              <span
                className={cn(
                  'ml-auto px-2 py-0.5 rounded',
                  s.endReason === 'COMPLETED' && 'bg-green-500/20 text-green-300',
                  s.endReason === 'CANCELLED' && 'bg-slate-700 text-slate-300',
                  s.endReason === 'ERROR' && 'bg-red-500/20 text-red-300',
                  s.endReason === 'TIMEOUT' && 'bg-amber-500/20 text-amber-200',
                  !s.endReason && 'bg-cyan-500/20 text-cyan-300',
                )}
              >
                {s.endReason ?? s.state}
              </span>
            </button>
          ))
        )}
      </div>

      {openId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-6 overflow-y-auto"
          onClick={close}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Session replay</h3>
                <div className="font-mono text-xs text-slate-500">{openId}</div>
              </div>
              <button
                onClick={close}
                className="text-slate-400 hover:text-slate-200 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {loadingReplay && <div className="text-sm text-slate-400">loading…</div>}

            {!loadingReplay && replay && (
              <div className="space-y-5">
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">
                    Meta
                  </div>
                  <div className="text-xs font-mono text-slate-300 space-y-0.5">
                    <div>state: {replay.session?.state}</div>
                    <div>started: {replay.session?.startedAt}</div>
                    {replay.session?.endedAt && <div>ended: {replay.session.endedAt}</div>}
                    {replay.session?.endReason && (
                      <div>end reason: {replay.session.endReason}</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">
                    XFS commands ({replay.commands.length})
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-slate-800 rounded">
                    {replay.commands.length === 0 ? (
                      <div className="p-2 text-xs text-slate-600">no commands</div>
                    ) : (
                      replay.commands.map((c) => (
                        <div
                          key={c.id}
                          className="p-2 text-xs flex gap-2 border-b border-slate-800 last:border-0"
                        >
                          <span className="text-slate-500 font-mono shrink-0">
                            {new Date(c.createdAt).toLocaleTimeString('id-ID')}
                          </span>
                          <span className="text-slate-400 font-mono shrink-0">{c.hService}</span>
                          <span
                            className={cn(
                              'font-mono truncate',
                              c.result === 0 ? 'text-cyan-300' : 'text-red-300',
                            )}
                          >
                            {c.commandCode}
                          </span>
                          {c.durationMs !== null && (
                            <span className="ml-auto text-slate-600 shrink-0">{c.durationMs}ms</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {replay.transactions.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">
                      Transactions
                    </div>
                    <div className="border border-slate-800 rounded divide-y divide-slate-800">
                      {replay.transactions.map((t) => (
                        <div key={t.id} className="p-2 text-xs flex gap-2 items-center">
                          <span className="text-slate-400 shrink-0">{t.txnType}</span>
                          <span className="shrink-0">
                            {Number(t.amount).toLocaleString('id-ID')} {t.currency}
                          </span>
                          {t.stanNo && (
                            <span className="text-slate-600 font-mono shrink-0">
                              STAN {t.stanNo}
                            </span>
                          )}
                          <span
                            className={cn(
                              'ml-auto px-2 py-0.5 rounded shrink-0',
                              t.status === 'COMPLETED' && 'bg-green-500/20 text-green-300',
                              t.status === 'REVERSED' && 'bg-amber-500/20 text-amber-200',
                              t.status === 'FAILED' && 'bg-red-500/20 text-red-300',
                            )}
                          >
                            {t.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
