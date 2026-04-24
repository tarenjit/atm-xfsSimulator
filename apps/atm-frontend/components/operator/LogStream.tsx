'use client';

import { useState } from 'react';
import { useAtmSocket } from '@/hooks/useAtmSocket';

type Filter = 'ALL' | 'EVENTS' | 'SRVE' | 'EXEE';

export function LogStream() {
  const { events, connected } = useAtmSocket();
  const [filter, setFilter] = useState<Filter>('ALL');

  const filtered = events.filter((e) => {
    if (filter === 'ALL' || filter === 'EVENTS') return true;
    return e.eventClass === filter;
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          XFS event stream
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={connected ? 'text-green-400' : 'text-red-400'}>
            {connected ? '● live' : '● offline'}
          </span>
          {(['ALL', 'SRVE', 'EXEE'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded ${filter === f ? 'bg-zegen-accent text-slate-900' : 'bg-slate-800 text-slate-300'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="border border-slate-800 bg-slate-950/60 rounded-lg p-3 h-72 overflow-y-auto font-mono text-xs space-y-1">
        {filtered.length === 0 ? (
          <div className="text-slate-600">no events yet — try using the ATM</div>
        ) : (
          filtered.map((e, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-slate-600 shrink-0">
                {new Date(e.timestamp).toLocaleTimeString('id-ID')}
              </span>
              <span
                className={`shrink-0 ${
                  e.eventClass === 'EXEE'
                    ? 'text-amber-300'
                    : e.eventClass === 'SYSE'
                      ? 'text-red-300'
                      : 'text-cyan-300'
                }`}
              >
                [{e.eventClass}]
              </span>
              <span className="text-slate-500 shrink-0">{e.hService}</span>
              <span className="truncate">{e.eventCode}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
