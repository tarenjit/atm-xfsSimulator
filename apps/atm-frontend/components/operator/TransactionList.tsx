'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Txn {
  id: string;
  sessionId: string;
  pan: string;
  txnType: string;
  amount: string | number;
  currency: string;
  status: string;
  stanNo?: string | null;
  authCode?: string | null;
  responseCode?: string | null;
  errorReason?: string | null;
  createdAt: string;
}

export function TransactionList() {
  const [txns, setTxns] = useState<Txn[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ transactions: Txn[] }>('/logs/transactions?limit=20');
      setTxns(r.transactions);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 4_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
        Recent transactions
      </h2>
      <div className="border border-slate-800 bg-slate-950/60 rounded-lg divide-y divide-slate-800">
        {txns.length === 0 ? (
          <div className="p-3 text-xs text-slate-600">no transactions yet</div>
        ) : (
          txns.map((t) => (
            <div key={t.id} className="p-3 text-xs flex items-center gap-3">
              <span className="text-slate-500 shrink-0 font-mono">
                {new Date(t.createdAt).toLocaleTimeString('id-ID')}
              </span>
              <span className="font-mono text-slate-400 shrink-0">
                ****{t.pan.slice(-4)}
              </span>
              <span className="shrink-0">{t.txnType}</span>
              <span className="shrink-0">
                {typeof t.amount === 'string'
                  ? Number(t.amount).toLocaleString('id-ID')
                  : t.amount.toLocaleString('id-ID')}{' '}
                {t.currency}
              </span>
              <span
                className={`ml-auto px-2 py-0.5 rounded ${
                  t.status === 'COMPLETED'
                    ? 'bg-green-500/20 text-green-300'
                    : t.status === 'REVERSED'
                      ? 'bg-amber-500/20 text-amber-200'
                      : t.status === 'FAILED'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-slate-700 text-slate-300'
                }`}
              >
                {t.status}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
