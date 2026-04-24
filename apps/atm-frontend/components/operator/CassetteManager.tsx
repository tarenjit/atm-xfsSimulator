'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface Cassette {
  unitId: string;
  denomination: number;
  status: string;
  count: number;
  maximum: number;
  minimum: number;
}

export function CassetteManager() {
  const [cassettes, setCassettes] = useState<Cassette[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ cassettes: Cassette[] }>('/cassettes');
      setCassettes(r.cassettes);
    } catch (e) {
      setMsg(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 3_000);
    return () => clearInterval(id);
  }, [load]);

  const replenish = async (unitId: string, count: number) => {
    try {
      await api(`/cassettes/${unitId}/replenish`, {
        method: 'PATCH',
        body: JSON.stringify({ count }),
      });
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  const jam = async (unitId: string) => {
    try {
      await api(`/cassettes/${unitId}/jam`, { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  const clearJam = async (unitId: string) => {
    try {
      await api(`/cassettes/${unitId}/clear-jam`, { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
        Cassettes
      </h2>
      <div className="space-y-2">
        {cassettes.map((c) => (
          <div
            key={c.unitId}
            className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 flex items-center gap-4"
          >
            <div className="flex-1">
              <div className="font-mono text-sm">{c.unitId}</div>
              <div className="text-xs text-slate-500">
                {c.denomination.toLocaleString('id-ID')} IDR · {c.count} / {c.maximum}
              </div>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                c.status === 'OK'
                  ? 'bg-green-500/20 text-green-300'
                  : c.status === 'LOW'
                    ? 'bg-amber-500/20 text-amber-200'
                    : c.status === 'JAMMED'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-slate-700 text-slate-300'
              }`}
            >
              {c.status}
            </span>
            {c.unitId !== 'REJECT' && (
              <div className="flex gap-1">
                <Button size="md" variant="secondary" className="text-xs" onClick={() => replenish(c.unitId, c.maximum)}>
                  refill
                </Button>
                {c.status !== 'JAMMED' ? (
                  <Button size="md" variant="ghost" className="text-xs" onClick={() => jam(c.unitId)}>
                    jam
                  </Button>
                ) : (
                  <Button size="md" variant="ghost" className="text-xs" onClick={() => clearJam(c.unitId)}>
                    clear
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {msg && <div className="text-xs text-slate-500">{msg}</div>}
    </section>
  );
}
