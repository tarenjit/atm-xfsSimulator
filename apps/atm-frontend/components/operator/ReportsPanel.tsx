'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, apiUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

interface MacroRunSummary {
  id: string;
  macroId: string;
  macroName: string;
  macroFolder: string | null;
  macroTags: string[];
  status: 'PASSED' | 'FAILED' | 'ABORTED' | 'RUNNING';
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  currentStep: number | null;
  stepCount: number;
}

interface RunListResponse {
  summary: {
    window: string;
    total: number;
    passed: number;
    failed: number;
    aborted: number;
    running: number;
  };
  runs: MacroRunSummary[];
}

interface MacroStep {
  order: number;
  device: string;
  operation: string;
  kind: string;
}

interface MacroStepResult {
  order: number;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  durationMs?: number;
  result?: string;
  error?: string;
}

interface MacroRunDetail {
  run: {
    id: string;
    status: string;
    durationMs: number | null;
    startedAt: string;
    completedAt: string | null;
    stepResults: MacroStepResult[] | null;
  };
  macro: {
    id: string;
    name: string;
    folder: string | null;
    description: string | null;
    tags: string[];
    steps: MacroStep[];
  };
  transactions: Array<{
    id: string;
    txnType: string;
    amount: string;
    status: string;
    stanNo: string | null;
    authCode: string | null;
    responseCode: string | null;
    errorReason: string | null;
    createdAt: string;
  }>;
  commands: Array<{
    id: string;
    hService: string;
    commandCode: string;
    result: number | null;
    durationMs: number | null;
    createdAt: string;
  }>;
  sessions: Array<{
    id: string;
    state: string;
    pan: string | null;
    startedAt: string;
    endedAt: string | null;
    endReason: string | null;
  }>;
}

const STATUS_CHIP: Record<string, string> = {
  PASSED: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300',
  FAILED: 'bg-red-500/15 border-red-400/40 text-red-300',
  ABORTED: 'bg-amber-500/15 border-amber-400/40 text-amber-300',
  RUNNING: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300',
};

function fmtDate(s: string): string {
  return new Date(s).toLocaleString('id-ID', { hour12: false });
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Operator-facing Reports panel (Phase 7.3).
 *
 * Three tiles:
 *   - Aggregate window summary (passed / failed / aborted / running counts)
 *   - Recent runs table (status / macro / duration / started)
 *   - Drill-down drawer — opens on row click; shows step results, parent
 *     macro description (the "what this exercises" text), linked
 *     transactions / sessions / XFS commands during the run window, and
 *     download links for the per-run PDF + executive monthly PDF.
 */
export function ReportsPanel() {
  const [data, setData] = useState<RunListResponse | null>(null);
  const [filter, setFilter] = useState<'' | 'PASSED' | 'FAILED' | 'ABORTED' | 'RUNNING'>('');
  const [error, setError] = useState<string | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MacroRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const qs = filter ? `?status=${filter}&take=50` : '?take=50';
      const r = await api<RunListResponse>(`/macro-runs${qs}`);
      setData(r);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 8_000);
    return () => clearInterval(t);
  }, [refresh]);

  const openDrawer = async (id: string) => {
    setOpenRunId(id);
    setDetailLoading(true);
    try {
      const d = await api<MacroRunDetail>(`/macro-runs/${id}`);
      setDetail(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDrawer = () => {
    setOpenRunId(null);
    setDetail(null);
  };

  const monthLabel = new Date().toISOString().slice(0, 7); // YYYY-MM
  const execHref = apiUrl(`/reports/executive?month=${monthLabel}`);

  return (
    <section className="rounded-lg p-4 chrome-panel space-y-4">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-sm uppercase tracking-widest text-zegen-accent">Reports</h2>
          <p className="text-xs chrome-dim mt-1">
            Every macro run, every transaction, every XFS command — recorded the moment it
            happens. Drill into any run for step-by-step results and a downloadable PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as '' | 'PASSED' | 'FAILED' | 'ABORTED' | 'RUNNING')}
            className="text-xs chrome-surface-2 border rounded px-2 py-1.5"
            data-testid="reports-status-filter"
          >
            <option value="">All statuses</option>
            <option value="PASSED">Passed</option>
            <option value="FAILED">Failed</option>
            <option value="ABORTED">Aborted</option>
            <option value="RUNNING">Running</option>
          </select>
          <a
            href={execHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded chrome-btn"
            data-testid="reports-executive-pdf"
          >
            Executive PDF ({monthLabel})
          </a>
          <button
            type="button"
            onClick={refresh}
            className="text-xs px-3 py-1.5 rounded chrome-btn"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
          <div className="rounded chrome-surface-2 border p-3">
            <div className="text-2xl font-semibold chrome-text">{data.summary.total}</div>
            <div className="text-[10px] uppercase tracking-widest chrome-dim mt-1">Total runs</div>
          </div>
          <div className="rounded border border-emerald-400/30 bg-emerald-500/5 p-3">
            <div className="text-2xl font-semibold text-emerald-300">{data.summary.passed}</div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-400/70 mt-1">
              Passed
            </div>
          </div>
          <div className="rounded border border-red-400/30 bg-red-500/5 p-3">
            <div className="text-2xl font-semibold text-red-300">{data.summary.failed}</div>
            <div className="text-[10px] uppercase tracking-widest text-red-400/70 mt-1">Failed</div>
          </div>
          <div className="rounded border border-amber-400/30 bg-amber-500/5 p-3">
            <div className="text-2xl font-semibold text-amber-300">{data.summary.aborted}</div>
            <div className="text-[10px] uppercase tracking-widest text-amber-400/70 mt-1">
              Aborted
            </div>
          </div>
          <div className="rounded border border-cyan-400/30 bg-cyan-500/5 p-3">
            <div className="text-2xl font-semibold text-cyan-300">{data.summary.running}</div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-400/70 mt-1">
              Running
            </div>
          </div>
        </div>
      )}

      {/* Run list */}
      <div className="rounded border chrome-border overflow-hidden" data-testid="reports-run-table">
        <table className="w-full text-xs">
          <thead className="chrome-surface-2">
            <tr className="text-left chrome-dim">
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Macro</th>
              <th className="px-3 py-2 font-medium">Folder</th>
              <th className="px-3 py-2 font-medium text-right">Steps</th>
              <th className="px-3 py-2 font-medium text-right">Duration</th>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(data?.runs ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center chrome-dim text-xs">
                  No runs yet — go to the Macro Test Studio above and press ▶ Play on any macro.
                </td>
              </tr>
            )}
            {(data?.runs ?? []).map((r) => (
              <tr
                key={r.id}
                className="border-t chrome-border hover:bg-cyan-400/5 cursor-pointer"
                onClick={() => openDrawer(r.id)}
              >
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'inline-block px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-widest',
                      STATUS_CHIP[r.status] ?? 'bg-slate-500/15 border-slate-400/40 text-slate-300',
                    )}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 chrome-text">{r.macroName}</td>
                <td className="px-3 py-2 chrome-dim">{r.macroFolder ?? '—'}</td>
                <td className="px-3 py-2 chrome-muted text-right font-mono">{r.stepCount}</td>
                <td className="px-3 py-2 chrome-muted text-right font-mono">
                  {fmtDuration(r.durationMs)}
                </td>
                <td className="px-3 py-2 chrome-muted">{fmtDate(r.startedAt)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="text-zegen-accent text-xs">View →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drill-down drawer */}
      {openRunId && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-4"
          onClick={closeDrawer}
          role="dialog"
          aria-modal="true"
          data-testid="reports-detail-drawer"
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto chrome-surface border rounded-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold chrome-text">
                  {detail?.macro.name ?? 'Loading…'}
                </h3>
                <div className="text-xs chrome-dim mt-1">
                  Run id <span className="font-mono">{openRunId.slice(0, 12)}…</span>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={apiUrl(`/reports/macro-run/${openRunId}/pdf`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded chrome-btn"
                  data-testid="reports-run-pdf"
                >
                  PDF
                </a>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="text-xs px-3 py-1.5 rounded chrome-btn"
                  aria-label="Close detail drawer"
                >
                  Close
                </button>
              </div>
            </header>

            {detailLoading && <div className="text-xs chrome-dim">Loading detail…</div>}

            {detail && (
              <>
                {/* Macro description — "what this exercises" */}
                {detail.macro.description && (
                  <section>
                    <h4 className="text-[10px] uppercase tracking-widest text-zegen-accent mb-1">
                      What this scenario exercises
                    </h4>
                    <p className="text-xs chrome-text leading-relaxed">
                      {detail.macro.description}
                    </p>
                    {detail.macro.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {detail.macro.tags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 text-[10px] rounded chrome-surface-2 border chrome-muted uppercase"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Run summary line */}
                <section className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded chrome-surface-2 border p-2">
                    <div className="chrome-dim text-[10px] uppercase tracking-widest">Status</div>
                    <div
                      className={cn(
                        'font-mono font-semibold mt-0.5',
                        detail.run.status === 'PASSED'
                          ? 'text-emerald-300'
                          : detail.run.status === 'FAILED'
                            ? 'text-red-300'
                            : 'chrome-text',
                      )}
                    >
                      {detail.run.status}
                    </div>
                  </div>
                  <div className="rounded chrome-surface-2 border p-2">
                    <div className="chrome-dim text-[10px] uppercase tracking-widest">
                      Duration
                    </div>
                    <div className="font-mono mt-0.5 chrome-text">
                      {fmtDuration(detail.run.durationMs)}
                    </div>
                  </div>
                  <div className="rounded chrome-surface-2 border p-2">
                    <div className="chrome-dim text-[10px] uppercase tracking-widest">Started</div>
                    <div className="font-mono mt-0.5 chrome-text">
                      {fmtDate(detail.run.startedAt)}
                    </div>
                  </div>
                  <div className="rounded chrome-surface-2 border p-2">
                    <div className="chrome-dim text-[10px] uppercase tracking-widest">Folder</div>
                    <div className="font-mono mt-0.5 chrome-text">
                      {detail.macro.folder ?? '—'}
                    </div>
                  </div>
                </section>

                {/* Step-by-step results */}
                <section>
                  <h4 className="text-[10px] uppercase tracking-widest text-zegen-accent mb-2">
                    Step results ({(detail.run.stepResults ?? []).length})
                  </h4>
                  <div className="rounded border chrome-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="chrome-surface-2 chrome-dim">
                        <tr>
                          <th className="px-2 py-1.5 text-left">#</th>
                          <th className="px-2 py-1.5 text-left">Step</th>
                          <th className="px-2 py-1.5 text-left">Status</th>
                          <th className="px-2 py-1.5 text-right">ms</th>
                          <th className="px-2 py-1.5 text-left">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.run.stepResults ?? []).map((s) => {
                          const def = (detail.macro.steps ?? []).find((x) => x.order === s.order);
                          return (
                            <tr
                              key={s.order}
                              className={cn(
                                'border-t chrome-border',
                                s.status === 'FAILED' && 'bg-red-500/5',
                              )}
                            >
                              <td className="px-2 py-1 font-mono chrome-muted">{s.order}</td>
                              <td className="px-2 py-1 font-mono">
                                {def
                                  ? `${def.device}:${def.operation}`
                                  : '(step definition missing)'}
                              </td>
                              <td className="px-2 py-1">
                                <span
                                  className={cn(
                                    'inline-block px-1.5 py-0.5 rounded border text-[10px] uppercase font-semibold',
                                    STATUS_CHIP[s.status === 'PASSED' ? 'PASSED' : s.status === 'FAILED' ? 'FAILED' : 'ABORTED'],
                                  )}
                                >
                                  {s.status}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-right font-mono chrome-muted">
                                {s.durationMs ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-[11px] chrome-text break-words">
                                {s.error ?? s.result ?? '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Linked transactions */}
                {detail.transactions.length > 0 && (
                  <section>
                    <h4 className="text-[10px] uppercase tracking-widest text-zegen-accent mb-2">
                      Transactions during this run ({detail.transactions.length})
                    </h4>
                    <div className="rounded border chrome-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="chrome-surface-2 chrome-dim">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Type</th>
                            <th className="px-2 py-1.5 text-right">Amount (Rp)</th>
                            <th className="px-2 py-1.5 text-left">Status</th>
                            <th className="px-2 py-1.5 text-left">STAN</th>
                            <th className="px-2 py-1.5 text-left">Auth</th>
                            <th className="px-2 py-1.5 text-left">Code</th>
                            <th className="px-2 py-1.5 text-left">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.transactions.map((t) => (
                            <tr key={t.id} className="border-t chrome-border">
                              <td className="px-2 py-1 font-mono chrome-text">{t.txnType}</td>
                              <td className="px-2 py-1 text-right font-mono chrome-text">
                                {Number(t.amount).toLocaleString('id-ID')}
                              </td>
                              <td className="px-2 py-1">
                                <span
                                  className={cn(
                                    'inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold',
                                    t.status === 'COMPLETED'
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : t.status === 'REVERSED'
                                        ? 'bg-amber-500/15 text-amber-300'
                                        : 'bg-red-500/15 text-red-300',
                                  )}
                                >
                                  {t.status}
                                </span>
                              </td>
                              <td className="px-2 py-1 font-mono chrome-muted">{t.stanNo ?? '—'}</td>
                              <td className="px-2 py-1 font-mono chrome-muted">
                                {t.authCode ?? '—'}
                              </td>
                              <td className="px-2 py-1 font-mono chrome-muted">
                                {t.responseCode ?? '—'}
                              </td>
                              <td className="px-2 py-1 chrome-muted text-[11px]">
                                {t.errorReason ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* XFS command log */}
                {detail.commands.length > 0 && (
                  <section>
                    <h4 className="text-[10px] uppercase tracking-widest text-zegen-accent mb-2">
                      XFS commands during this run ({detail.commands.length})
                    </h4>
                    <div className="rounded border chrome-border overflow-y-auto max-h-60">
                      <table className="w-full text-xs">
                        <thead className="chrome-surface-2 chrome-dim sticky top-0">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Service</th>
                            <th className="px-2 py-1.5 text-left">Command</th>
                            <th className="px-2 py-1.5 text-right">Result</th>
                            <th className="px-2 py-1.5 text-right">ms</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.commands.map((c) => (
                            <tr key={c.id} className="border-t chrome-border">
                              <td className="px-2 py-1 font-mono chrome-muted">{c.hService}</td>
                              <td className="px-2 py-1 font-mono chrome-text">{c.commandCode}</td>
                              <td
                                className={cn(
                                  'px-2 py-1 text-right font-mono',
                                  c.result === 0 ? 'text-emerald-300' : c.result == null ? 'chrome-muted' : 'text-red-300',
                                )}
                              >
                                {c.result ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-right font-mono chrome-muted">
                                {c.durationMs ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
