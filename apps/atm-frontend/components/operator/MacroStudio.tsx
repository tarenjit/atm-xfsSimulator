'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface MacroStep {
  id: string;
  order: number;
  kind: 'ACTION' | 'CHECKPOINT' | 'ASSERTION' | 'WAIT';
  device: string;
  operation: string;
  parameters: Array<{ name: string; type: string; value: unknown; displayLabel?: string }>;
  enabled: boolean;
}

interface Macro {
  id: string;
  name: string;
  folder?: string | null;
  description?: string | null;
  tags: string[];
  steps: MacroStep[];
  updatedAt: string;
}

interface MacroStepResult {
  id: string;
  order: number;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  message?: string;
  error?: string;
}

interface MacroRunFrame {
  id: string;
  macroId: string;
  status: 'RUNNING' | 'PASSED' | 'FAILED' | 'ABORTED';
  stepResults: MacroStepResult[];
  durationMs?: number;
}

/**
 * Macro Test Studio panel — the flagship Update_features.md §4 feature.
 * MVP: list / preview / run. Full editor with drag-reorder, recording,
 * and folder tree arrives in Phase 8b.2.
 */
export function MacroStudio() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [run, setRun] = useState<MacroRunFrame | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = macros.find((m) => m.id === selectedId);

  const load = async () => {
    try {
      const r = await api<{ macros: Macro[] }>('/macros');
      setMacros(r.macros);
      if (!selectedId && r.macros.length > 0) setSelectedId(r.macros[0].id);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runMacro = async (id: string) => {
    setRunning(true);
    setRun(null);
    setError(null);
    try {
      const r = await api<{ run: MacroRunFrame }>(`/macros/${id}/run`, {
        method: 'POST',
        timeoutMs: 120_000,
      });
      setRun(r.run);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest chrome-dim">
          Macro Test Studio
        </h2>
        <div className="text-xs chrome-muted">
          {macros.length} saved{selected && ` · viewing ${selected.name}`}
        </div>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4">
        {/* Macro list */}
        <div className="chrome-surface border rounded-lg p-2 max-h-96 overflow-y-auto">
          {macros.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className={cn(
                'w-full text-left p-2 rounded text-xs transition-colors',
                selectedId === m.id
                  ? 'bg-zegen-accent/20 border border-zegen-accent/50'
                  : 'hover:bg-white/5 border border-transparent',
              )}
            >
              <div className="font-medium chrome-text">{m.name}</div>
              <div className="chrome-dim font-mono text-[10px]">
                {m.folder ?? 'unfiled'} · {m.steps?.length ?? 0} steps
              </div>
            </button>
          ))}
          {macros.length === 0 && (
            <div className="p-3 text-xs chrome-dim">no macros yet</div>
          )}
        </div>

        {/* Steps + run */}
        <div className="space-y-3">
          {selected ? (
            <>
              <div className="chrome-surface border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold chrome-text">{selected.name}</div>
                    {selected.description && (
                      <div className="text-xs chrome-muted mt-0.5">{selected.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => runMacro(selected.id)}
                    disabled={running}
                    className="px-4 py-2 rounded bg-green-600 text-white font-medium text-sm hover:bg-green-500 disabled:opacity-40 flex items-center gap-2"
                  >
                    {running ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Running
                      </>
                    ) : (
                      <>▶ Play</>
                    )}
                  </button>
                </div>

                <div className="border-t chrome-border pt-2 space-y-1">
                  {selected.steps.map((s) => {
                    const result = run?.stepResults.find((r) => r.id === s.id);
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          'p-2 rounded text-xs flex items-center gap-2 font-mono',
                          result?.status === 'PASSED' && 'bg-green-500/10',
                          result?.status === 'FAILED' && 'bg-red-500/10',
                          !result && !s.enabled && 'opacity-40',
                        )}
                      >
                        <span className="w-5 text-right chrome-dim">{s.order}</span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] uppercase',
                            s.kind === 'ACTION'
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : s.kind === 'CHECKPOINT'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-500/20 text-slate-300',
                          )}
                        >
                          {s.kind}
                        </span>
                        <span className="chrome-muted shrink-0">{s.device}:</span>
                        <span className="chrome-text">{s.operation}</span>
                        {s.parameters.length > 0 && (
                          <span className="chrome-dim">
                            (
                            {s.parameters
                              .map((p) => p.displayLabel ?? `${p.name}=${String(p.value)}`)
                              .join(', ')}
                            )
                          </span>
                        )}
                        {result && (
                          <span
                            className={cn(
                              'ml-auto shrink-0 text-[10px]',
                              result.status === 'PASSED' && 'text-green-400',
                              result.status === 'FAILED' && 'text-red-400',
                            )}
                          >
                            {result.status} · {result.durationMs}ms
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {run && (
                <div
                  className={cn(
                    'border rounded-lg p-3 text-xs',
                    run.status === 'PASSED'
                      ? 'bg-green-500/10 border-green-500/30 text-green-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300',
                  )}
                >
                  Run {run.id.slice(0, 12)}… → <strong>{run.status}</strong> in {run.durationMs}ms
                </div>
              )}
            </>
          ) : (
            <div className="chrome-surface border rounded-lg p-8 text-center text-xs chrome-dim">
              Pick a macro from the list
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
