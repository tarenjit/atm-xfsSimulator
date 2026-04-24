'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Suite {
  id: string;
  name: string;
  macroIds: string[];
  cron: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Macro {
  id: string;
  name: string;
}

interface SuiteRun {
  id: string;
  suiteId: string;
  status: 'RUNNING' | 'PASSED' | 'FAILED' | 'ABORTED';
  triggeredBy: string;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  macroRuns?: Array<{ id: string; macroId: string; status: string; durationMs: number | null }>;
}

/**
 * Macro Suite management (Update_features.md §4.x scheduling).
 * MVP: list, create, edit cron / macroIds, enable/disable, run-now,
 * view recent runs.
 */
export function SuitePanel() {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<SuiteRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = suites.find((s) => s.id === selectedId);

  const load = async () => {
    try {
      const [a, b] = await Promise.all([
        api<{ suites: Suite[] }>('/suites'),
        api<{ macros: Macro[] }>('/macros'),
      ]);
      setSuites(a.suites);
      setMacros(b.macros);
      if (!selectedId && a.suites.length > 0) setSelectedId(a.suites[0].id);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ runs: SuiteRun[] }>(`/suites/${selectedId}/runs`);
        if (!cancelled) setRuns(r.runs);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const createSuite = async () => {
    const name = window.prompt('New suite name?', 'Untitled suite');
    if (!name) return;
    setBusy(true);
    try {
      const r = await api<{ suite: Suite }>('/suites', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await load();
      setSelectedId(r.suite.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSuite = async (patch: Partial<Suite>) => {
    if (!selectedId) return;
    try {
      const r = await api<{ suite: Suite }>(`/suites/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setSuites((prev) => prev.map((s) => (s.id === r.suite.id ? r.suite : s)));
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteSuite = async () => {
    if (!selectedId) return;
    if (!window.confirm('Delete this suite? Existing run history is kept via cascade.')) return;
    try {
      await api(`/suites/${selectedId}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const runNow = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/suites/${selectedId}/run`, { method: 'POST', timeoutMs: 600_000 });
      // Refresh runs list
      const r = await api<{ runs: SuiteRun[] }>(`/suites/${selectedId}/runs`);
      setRuns(r.runs);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleMacro = (macroId: string) => {
    if (!selected) return;
    const next = selected.macroIds.includes(macroId)
      ? selected.macroIds.filter((x) => x !== macroId)
      : [...selected.macroIds, macroId];
    void saveSuite({ macroIds: next });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest chrome-dim">
          Macro Suites
        </h2>
        <div className="text-xs chrome-muted flex items-center gap-3">
          <span>{suites.length} saved</span>
          <button
            onClick={createSuite}
            disabled={busy}
            className="px-2 py-1 rounded bg-zegen-accent/20 border border-zegen-accent/50 text-zegen-accent text-[10px] uppercase tracking-widest hover:bg-zegen-accent/30 disabled:opacity-40"
          >
            + New
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        {/* Suite list */}
        <div className="chrome-surface border rounded-lg p-2 max-h-80 overflow-y-auto">
          {suites.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={cn(
                'w-full text-left p-2 rounded text-xs transition-colors',
                selectedId === s.id
                  ? 'bg-zegen-accent/20 border border-zegen-accent/50'
                  : 'hover:bg-white/5 border border-transparent',
              )}
            >
              <div className="font-medium chrome-text flex items-center gap-2">
                {!s.enabled && <span className="text-[9px] px-1 rounded bg-slate-500/30 text-slate-400">disabled</span>}
                <span>{s.name}</span>
              </div>
              <div className="chrome-dim font-mono text-[10px]">
                {s.macroIds.length} macro{s.macroIds.length === 1 ? '' : 's'}
                {s.cron && ` · cron ${s.cron}`}
              </div>
            </button>
          ))}
          {suites.length === 0 && <div className="p-3 text-xs chrome-dim">no suites yet</div>}
        </div>

        {/* Detail */}
        <div className="space-y-3">
          {selected ? (
            <>
              <div className="chrome-surface border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <input
                    className="chrome-text font-semibold bg-transparent outline-none border-b chrome-border focus:border-zegen-accent px-1 py-0.5"
                    value={selected.name}
                    onChange={(e) =>
                      setSuites((prev) =>
                        prev.map((s) => (s.id === selected.id ? { ...s, name: e.target.value } : s)),
                      )
                    }
                    onBlur={(e) => saveSuite({ name: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs chrome-muted">
                      <input
                        type="checkbox"
                        className="accent-zegen-accent cursor-pointer"
                        checked={selected.enabled}
                        onChange={(e) => saveSuite({ enabled: e.target.checked })}
                      />
                      enabled
                    </label>
                    <button
                      onClick={runNow}
                      disabled={busy || selected.macroIds.length === 0}
                      className="px-3 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-500 disabled:opacity-40"
                    >
                      {busy ? 'Running…' : '▶ Run now'}
                    </button>
                    <button
                      onClick={deleteSuite}
                      title="Delete this suite"
                      className="px-2 py-1.5 rounded border chrome-border chrome-muted hover:text-red-400 hover:border-red-400 text-xs"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <span className="chrome-muted w-14 shrink-0">cron</span>
                  <input
                    className="flex-1 chrome-surface-2 border rounded px-2 py-1 chrome-text font-mono"
                    placeholder="e.g. 0 2 * * *  (blank = on-demand only)"
                    defaultValue={selected.cron ?? ''}
                    onBlur={(e) => saveSuite({ cron: e.target.value.trim() })}
                  />
                </label>

                <div className="space-y-1">
                  <div className="text-xs chrome-muted">Macros (click to toggle)</div>
                  <div className="grid sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                    {macros.map((m) => {
                      const checked = selected.macroIds.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMacro(m.id)}
                            className="accent-zegen-accent cursor-pointer"
                          />
                          <span className="chrome-text truncate">{m.name}</span>
                        </label>
                      );
                    })}
                    {macros.length === 0 && (
                      <div className="text-xs chrome-dim">no macros yet — create one first</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent runs */}
              <div className="chrome-surface border rounded-lg p-3 space-y-2">
                <div className="text-xs chrome-muted">Recent runs</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {runs.length === 0 ? (
                    <div className="text-xs chrome-dim">no runs yet</div>
                  ) : (
                    runs.map((r) => (
                      <div
                        key={r.id}
                        className={cn(
                          'p-2 rounded text-xs flex items-center gap-3 font-mono',
                          r.status === 'PASSED' && 'bg-green-500/10',
                          r.status === 'FAILED' && 'bg-red-500/10',
                          r.status === 'RUNNING' && 'bg-cyan-500/10',
                        )}
                      >
                        <span className="chrome-dim shrink-0">
                          {new Date(r.startedAt).toLocaleTimeString('id-ID')}
                        </span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] uppercase shrink-0',
                            r.status === 'PASSED' && 'bg-green-500/30 text-green-300',
                            r.status === 'FAILED' && 'bg-red-500/30 text-red-300',
                            r.status === 'RUNNING' && 'bg-cyan-500/30 text-cyan-300',
                          )}
                        >
                          {r.status}
                        </span>
                        <span className="chrome-muted shrink-0">{r.triggeredBy}</span>
                        <span className="chrome-dim">
                          {r.durationMs !== null && r.durationMs !== undefined
                            ? `${r.durationMs}ms`
                            : '—'}
                        </span>
                        <span className="chrome-dim ml-auto">
                          {r.macroRuns?.length ?? 0} macro runs
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="chrome-surface border rounded-lg p-8 text-center text-xs chrome-dim">
              Pick a suite or create one.
            </div>
          )}

          {error && (
            <div className="text-xs p-2 rounded bg-red-500/10 border border-red-500/40 text-red-500">
              {error}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
