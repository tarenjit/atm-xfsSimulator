'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import type { VirtualCardSummary } from '@/types/atm';

interface Props {
  onInserted: () => void;
}

export function CardPicker({ onInserted }: Props) {
  const [cards, setCards] = useState<VirtualCardSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ cards: VirtualCardSummary[] }>('/cards');
        if (!cancelled) setCards(data.cards);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const insertCard = async (pan: string) => {
    setLoading(true);
    setError(null);
    try {
      await api('/sessions/insert-card', {
        method: 'POST',
        body: JSON.stringify({ pan }),
      });
      onInserted();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 text-left">
      <div className="text-xs uppercase tracking-widest text-slate-500">Simulate card insertion</div>
      <div className="space-y-2">
        {cards.map((c) => (
          <label
            key={c.pan}
            className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 hover:border-zegen-accent cursor-pointer"
          >
            <input
              type="radio"
              name="card"
              value={c.pan}
              checked={selected === c.pan}
              onChange={() => setSelected(c.pan)}
            />
            <div className="flex-1">
              <div className="font-mono text-sm">{c.pan}</div>
              <div className="text-xs text-slate-500">
                {c.cardholderName} · exp {c.expiryDate} · {c.status}
              </div>
            </div>
          </label>
        ))}
        {cards.length === 0 && (
          <div className="text-xs text-slate-500">Loading cards…</div>
        )}
      </div>
      <Button
        className="w-full"
        disabled={!selected || loading}
        onClick={() => selected && insertCard(selected)}
      >
        {loading ? 'Inserting…' : 'Insert card'}
      </Button>
      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}
