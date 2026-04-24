'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { BankTheme } from '@/types/atm';

/**
 * Operator-facing switcher that flips the active bank theme. The backend
 * emits `atm.themeChanged` over the WS on success, which the ATM screen
 * subscribes to — so the virtual ATM's blue screen re-themes live.
 */
export function ThemeSwitcher() {
  const [themes, setThemes] = useState<BankTheme[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, active] = await Promise.all([
          api<{ themes: BankTheme[] }>('/themes'),
          api<{ theme: BankTheme }>('/themes/active'),
        ]);
        if (!cancelled) {
          setThemes(list.themes);
          setActiveCode(active.theme.code);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = async (code: string) => {
    if (code === activeCode) return;
    setBusy(code);
    setError(null);
    try {
      const r = await api<{ theme: BankTheme }>('/themes/active', {
        method: 'PATCH',
        body: JSON.stringify({ code }),
      });
      setActiveCode(r.theme.code);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest chrome-dim">
          Bank theme
        </h2>
        {activeCode && (
          <span className="text-xs chrome-muted font-mono">active: {activeCode}</span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {themes.map((t) => {
          const isActive = t.code === activeCode;
          const isBusy = busy === t.code;
          return (
            <button
              key={t.code}
              onClick={() => pick(t.code)}
              disabled={isBusy || isActive}
              className={cn(
                'p-3 rounded-lg border transition-all text-left relative overflow-hidden',
                isActive
                  ? 'border-zegen-accent ring-2 ring-zegen-accent/40'
                  : 'chrome-border hover:border-zegen-accent',
                isBusy && 'opacity-50 cursor-wait',
              )}
              style={{
                background: `linear-gradient(135deg, ${t.primaryColor} 0%, ${t.primaryColor} 60%, ${t.secondaryColor} 100%)`,
              }}
            >
              <div className="text-sm font-semibold text-white drop-shadow">{t.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/70 font-mono">
                {t.code}
              </div>
              {isActive && (
                <div className="absolute top-1 right-1 text-[10px] uppercase font-bold text-white bg-black/40 px-1.5 py-0.5 rounded">
                  active
                </div>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <div className="text-xs p-2 rounded bg-red-500/10 border border-red-500/40 text-red-500">
          {error}
        </div>
      )}
    </section>
  );
}
