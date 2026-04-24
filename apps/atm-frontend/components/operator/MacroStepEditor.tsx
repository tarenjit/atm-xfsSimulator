'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export interface MacroStep {
  id: string;
  order: number;
  kind: 'ACTION' | 'CHECKPOINT' | 'ASSERTION' | 'WAIT';
  device: string;
  operation: string;
  parameters: Array<{ name: string; type: string; value: unknown; displayLabel?: string }>;
  enabled: boolean;
}

export interface MacroStepResult {
  id: string;
  order: number;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  durationMs: number;
  message?: string;
  error?: string;
}

interface Props {
  steps: MacroStep[];
  results?: MacroStepResult[];
  readOnly?: boolean;
  onChange: (steps: MacroStep[]) => void;
}

/**
 * Per-macro step list with inline editing (Update_features.md §4.4).
 *
 * MVP: enable/disable, reorder up/down, delete. Drag-reorder and
 * parameter edit-in-place land in §4.4 v2 — those need a proper form
 * per step and proper pointer-events handling; keyboard-driven here
 * covers 80% of the value for zero risk.
 *
 * Uncontrolled parent: MacroStudio passes `steps` as the source of
 * truth and receives `onChange(next)` whenever the user mutates the
 * list. MacroStudio decides when to persist via PATCH.
 */
export function MacroStepEditor({ steps, results, readOnly, onChange }: Props) {
  const sorted = [...steps].sort((a, b) => a.order - b.order);

  const withReorder = (updater: (xs: MacroStep[]) => MacroStep[]) => {
    const next = updater(sorted).map((s, i) => ({ ...s, order: i + 1 }));
    onChange(next);
  };

  const toggleEnabled = (id: string) => {
    withReorder((xs) => xs.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const moveUp = (id: string) => {
    withReorder((xs) => {
      const idx = xs.findIndex((s) => s.id === id);
      if (idx <= 0) return xs;
      const copy = [...xs];
      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
      return copy;
    });
  };

  const moveDown = (id: string) => {
    withReorder((xs) => {
      const idx = xs.findIndex((s) => s.id === id);
      if (idx < 0 || idx >= xs.length - 1) return xs;
      const copy = [...xs];
      [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
      return copy;
    });
  };

  const remove = (id: string) => {
    withReorder((xs) => xs.filter((s) => s.id !== id));
  };

  if (sorted.length === 0) {
    return (
      <div className="text-xs chrome-dim p-4 text-center border-2 border-dashed chrome-border rounded">
        No steps yet. Record a session or add them programmatically via the REST API.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((s, idx) => {
        const result = results?.find((r) => r.id === s.id);
        const isFirst = idx === 0;
        const isLast = idx === sorted.length - 1;
        return (
          <StepRow
            key={s.id}
            step={s}
            result={result}
            isFirst={isFirst}
            isLast={isLast}
            readOnly={readOnly ?? false}
            onToggle={() => toggleEnabled(s.id)}
            onMoveUp={() => moveUp(s.id)}
            onMoveDown={() => moveDown(s.id)}
            onDelete={() => remove(s.id)}
          />
        );
      })}
    </div>
  );
}

function StepRow({
  step,
  result,
  isFirst,
  isLast,
  readOnly,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  step: MacroStep;
  result?: MacroStepResult;
  isFirst: boolean;
  isLast: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 2500);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  return (
    <div
      className={cn(
        'group p-2 rounded text-xs flex items-center gap-2 font-mono border border-transparent',
        result?.status === 'PASSED' && 'bg-green-500/10 border-green-500/30',
        result?.status === 'FAILED' && 'bg-red-500/10 border-red-500/30',
        !result && !step.enabled && 'opacity-50',
        !result && step.enabled && 'hover:bg-white/5',
      )}
    >
      <input
        type="checkbox"
        checked={step.enabled}
        onChange={onToggle}
        disabled={readOnly}
        title={step.enabled ? 'disable this step' : 'enable this step'}
        className="accent-zegen-accent cursor-pointer disabled:opacity-40"
      />
      <span className="w-5 text-right chrome-dim shrink-0">{step.order}</span>
      <span
        className={cn(
          'px-1.5 py-0.5 rounded text-[10px] uppercase shrink-0',
          step.kind === 'ACTION'
            ? 'bg-cyan-500/20 text-cyan-300'
            : step.kind === 'CHECKPOINT'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-slate-500/20 text-slate-300',
        )}
      >
        {step.kind}
      </span>
      <span className="chrome-muted shrink-0">{step.device}:</span>
      <span className="chrome-text shrink-0">{step.operation}</span>
      {step.parameters.length > 0 && (
        <span className="chrome-dim truncate">
          (
          {step.parameters
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

      {!readOnly && !result && (
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
            className="px-1.5 py-0.5 text-slate-400 hover:text-zegen-accent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            title="Move down"
            className="px-1.5 py-0.5 text-slate-400 hover:text-zegen-accent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↓
          </button>
          {confirmDelete ? (
            <button
              onClick={onDelete}
              title="Click again to confirm delete"
              className="px-1.5 py-0.5 text-red-400 hover:text-red-300 uppercase text-[10px] font-bold"
            >
              confirm?
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete step"
              className="px-1.5 py-0.5 text-slate-400 hover:text-red-400"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
