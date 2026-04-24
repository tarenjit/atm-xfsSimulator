'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import type { VirtualCardSummary } from '@/types/atm';

export function CardManager() {
  const [cards, setCards] = useState<VirtualCardSummary[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ cards: VirtualCardSummary[] }>('/cards');
      setCards(r.cards);
    } catch (e) {
      setMsg(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (pan: string) => {
    if (!confirm(`Delete card ${pan}?`)) return;
    try {
      await api(`/cards/${pan}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
        Virtual cards
      </h2>
      <div className="space-y-2">
        {cards.map((c) => (
          <div
            key={c.pan}
            className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 flex items-center gap-4"
          >
            <div className="flex-1">
              <div className="font-mono text-sm">{c.pan}</div>
              <div className="text-xs text-slate-500">
                {c.cardholderName} · exp {c.expiryDate}
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
              {c.status}
            </span>
            <Button variant="ghost" size="md" className="text-xs" onClick={() => remove(c.pan)}>
              delete
            </Button>
          </div>
        ))}
      </div>
      {msg && <div className="text-xs text-slate-500">{msg}</div>}
    </section>
  );
}
