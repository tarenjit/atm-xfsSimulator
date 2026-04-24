'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
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
 * Macro Test Studio panel — Update_features.md §4 + §9 (recording).
 *
 * Features:
 *   - List, preview, and run saved macros with per-step pass/fail.
 *   - Create a new (blank) macro inline.
 *   - Record: capture live user actions + significant XFS events into
 *     MacroStep[] and persist on stop. A banner shows the live step
 *     count while recording so the operator can tell it's working.
 */
export function MacroStudio() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [run, setRun] = useState<MacroRunFrame | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recording state
  const [recordingMacroId, setRecordingMacroId] = useState<string | null>(null);
  const [recordingStepCount, setRecordingStepCount] = useState(0);
  const [creating, setCreating] = useState(false);

  const selected = macros.find((m) => m.id === selectedId);
  const isRecording = recordingMacroId !== null;
  const isRecordingThis = selected && recordingMacroId === selected.id;

  const load = async (preserveSelection = true) => {
    try {
      const r = await api<{ macros: Macro[] }>('/macros');
      setMacros(r.macros);
      if (!preserveSelection || !selectedId) {
        if (r.macros.length > 0) setSelectedId(r.macros[0].id);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void load(false);
    // Poll recorder status on mount in case a prior session left it on.
    (async () => {
      try {
        const s = await api<{ recording: boolean; macroId?: string; stepCount?: number }>(
          '/macros/recorder/status',
        );
        if (s.recording && s.macroId) {
          setRecordingMacroId(s.macroId);
          setRecordingStepCount(s.stepCount ?? 0);
        }
      } catch {
        /* backend not up yet */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live step counter while recording: subscribe to atm.userAction over WS.
  useEffect(() => {
    if (!recordingMacroId) return;
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';
    const socket: Socket = io(`${url}/xfs`, { transports: ['websocket', 'polling'] });
    socket.on('atm.userAction', () => {
      setRecordingStepCount((n) => n + 1);
    });
    return () => {
      socket.close();
    };
  }, [recordingMacroId]);

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

  const startRecording = async (id: string) => {
    setError(null);
    try {
      await api(`/macros/${id}/record/start`, { method: 'POST' });
      setRecordingMacroId(id);
      setRecordingStepCount(0);
    } catch (e) {
      setError(String(e));
    }
  };

  const stopRecording = async () => {
    if (!recordingMacroId) return;
    const id = recordingMacroId;
    setError(null);
    try {
      await api(`/macros/${id}/record/stop`, { method: 'POST' });
      setRecordingMacroId(null);
      setRecordingStepCount(0);
      await load(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const createMacro = async () => {
    const name = window.prompt('New macro name?', 'Untitled macro');
    if (!name) return;
    setCreating(true);
    try {
      const r = await api<{ macro: Macro }>('/macros', {
        method: 'POST',
        body: JSON.stringify({ name, folder: 'Recorded' }),
      });
      await load(false);
      setSelectedId(r.macro.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest chrome-dim">
          Macro Test Studio
        </h2>
        <div className="text-xs chrome-muted flex items-center gap-3">
          <span>
            {macros.length} saved{selected && ` · viewing ${selected.name}`}
          </span>
          <button
            onClick={createMacro}
            disabled={creating || isRecording}
            className="px-2 py-1 rounded bg-zegen-accent/20 border border-zegen-accent/50 text-zegen-accent text-[10px] uppercase tracking-widest hover:bg-zegen-accent/30 disabled:opacity-40"
          >
            + New
          </button>
        </div>
      </div>

      {/* Live recording banner */}
      {isRecording && (
        <div className="rounded-lg border-2 border-red-500 bg-red-500/10 p-3 flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <div className="flex-1 text-xs">
            <div className="text-red-300 font-semibold">
              Recording into{' '}
              {macros.find((m) => m.id === recordingMacroId)?.name ?? recordingMacroId}
            </div>
            <div className="chrome-muted font-mono">
              {recordingStepCount} user action{recordingStepCount === 1 ? '' : 's'} captured · drive
              the ATM at <code>/atm</code> to record steps
            </div>
          </div>
          <button
            onClick={stopRecording}
            className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-500"
          >
            ■ Stop
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[300px_1fr] gap-4">
        {/* Macro list */}
        <div className="chrome-surface border rounded-lg p-2 max-h-96 overflow-y-auto">
          {macros.map((m) => {
            const isBeingRecorded = recordingMacroId === m.id;
            return (
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
                <div className="font-medium chrome-text flex items-center gap-2">
                  {isBeingRecorded && (
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  <span>{m.name}</span>
                </div>
                <div className="chrome-dim font-mono text-[10px]">
                  {m.folder ?? 'unfiled'} · {m.steps?.length ?? 0} steps
                </div>
              </button>
            );
          })}
          {macros.length === 0 && <div className="p-3 text-xs chrome-dim">no macros yet</div>}
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
                  <div className="flex items-center gap-2">
                    {isRecordingThis ? (
                      <button
                        onClick={stopRecording}
                        className="px-4 py-2 rounded bg-red-600 text-white font-medium text-sm hover:bg-red-500 flex items-center gap-2"
                      >
                        ■ Stop recording
                      </button>
                    ) : (
                      <button
                        onClick={() => startRecording(selected.id)}
                        disabled={isRecording || running}
                        title={
                          isRecording
                            ? 'another recording is in progress'
                            : 'record user actions on /atm into this macro'
                        }
                        className="px-3 py-2 rounded border-2 border-red-500 text-red-400 font-medium text-sm hover:bg-red-500/10 disabled:opacity-40 flex items-center gap-2"
                      >
                        ● Record
                      </button>
                    )}
                    <button
                      onClick={() => runMacro(selected.id)}
                      disabled={running || isRecording}
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
