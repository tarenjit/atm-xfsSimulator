'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export interface MacroStepParameter {
  name: string;
  type: string; // 'string' | 'number' | 'boolean' | 'variable' — treated as a free-form string at runtime
  value: unknown;
  displayLabel?: string;
}

export interface MacroStep {
  id: string;
  order: number;
  kind: 'ACTION' | 'CHECKPOINT' | 'ASSERTION' | 'WAIT';
  device: string;
  operation: string;
  parameters: MacroStepParameter[];
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
 * v2 adds parameter edit-in-place: click the ▸ chevron on a step to
 * expand a parameter form. Each parameter's type picks the input
 * widget (string → text, number → numeric, boolean → checkbox,
 * variable → text with a `$` helper affordance).
 *
 * Controlled externally: parent holds the step list, passes it in as
 * `steps`, and receives a fully re-ordered list via `onChange(next)`
 * whenever the user mutates anything. Parent decides when to persist.
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
  const updateParams = (id: string, params: MacroStepParameter[]) => {
    withReorder((xs) =>
      xs.map((s) => (s.id === id ? { ...s, parameters: params } : s)),
    );
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
        return (
          <StepRow
            key={s.id}
            step={s}
            result={result}
            isFirst={idx === 0}
            isLast={idx === sorted.length - 1}
            readOnly={readOnly ?? false}
            onToggle={() => toggleEnabled(s.id)}
            onMoveUp={() => moveUp(s.id)}
            onMoveDown={() => moveDown(s.id)}
            onDelete={() => remove(s.id)}
            onUpdateParams={(ps) => updateParams(s.id, ps)}
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
  onUpdateParams,
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
  onUpdateParams: (params: MacroStepParameter[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 2500);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const hasParams = step.parameters.length > 0;

  return (
    <div
      className={cn(
        'group rounded text-xs border border-transparent',
        result?.status === 'PASSED' && 'bg-green-500/10 border-green-500/30',
        result?.status === 'FAILED' && 'bg-red-500/10 border-red-500/30',
        !result && !step.enabled && 'opacity-50',
        !result && step.enabled && 'hover:bg-white/5',
      )}
    >
      <div className="p-2 flex items-center gap-2 font-mono">
        <input
          type="checkbox"
          checked={step.enabled}
          onChange={onToggle}
          disabled={readOnly}
          title={step.enabled ? 'disable this step' : 'enable this step'}
          className="accent-zegen-accent cursor-pointer disabled:opacity-40"
        />
        <button
          onClick={() => setExpanded((x) => !x)}
          disabled={!hasParams}
          title={hasParams ? (expanded ? 'collapse' : 'expand') : 'no parameters'}
          className={cn(
            'w-4 text-center chrome-dim transition-transform',
            expanded && 'rotate-90',
            !hasParams && 'opacity-30 cursor-not-allowed',
          )}
        >
          ▸
        </button>
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
        {hasParams && !expanded && (
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

      {expanded && hasParams && (
        <ParamEditor
          params={step.parameters}
          readOnly={readOnly || !!result}
          onChange={onUpdateParams}
        />
      )}
    </div>
  );
}

function ParamEditor({
  params,
  readOnly,
  onChange,
}: {
  params: MacroStepParameter[];
  readOnly: boolean;
  onChange: (next: MacroStepParameter[]) => void;
}) {
  const update = (idx: number, patch: Partial<MacroStepParameter>) => {
    onChange(params.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  return (
    <div className="px-3 pb-3 pt-1 space-y-2 border-t chrome-border">
      {params.map((p, idx) => (
        <ParamRow
          key={`${p.name}-${idx}`}
          param={p}
          readOnly={readOnly}
          onChange={(patch) => update(idx, patch)}
        />
      ))}
    </div>
  );
}

function ParamRow({
  param,
  readOnly,
  onChange,
}: {
  param: MacroStepParameter;
  readOnly: boolean;
  onChange: (patch: Partial<MacroStepParameter>) => void;
}) {
  // Local state for text inputs so typing doesn't fire PATCH on every keypress.
  const [localValue, setLocalValue] = useState<string>(String(param.value ?? ''));

  useEffect(() => {
    setLocalValue(String(param.value ?? ''));
  }, [param.value]);

  const commit = () => {
    if (param.type === 'number') {
      const n = Number(localValue);
      if (!Number.isFinite(n)) {
        setLocalValue(String(param.value ?? ''));
        return;
      }
      onChange({ value: n });
    } else {
      onChange({ value: localValue });
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="chrome-muted w-20 shrink-0 truncate" title={param.name}>
        {param.name}
      </span>

      <select
        value={param.type}
        disabled={readOnly}
        onChange={(e) => onChange({ type: e.target.value })}
        className="chrome-surface-2 border rounded px-1 py-0.5 chrome-text text-[11px]"
      >
        <option value="string">string</option>
        <option value="number">number</option>
        <option value="boolean">boolean</option>
        <option value="variable">variable</option>
      </select>

      {param.type === 'boolean' ? (
        <input
          type="checkbox"
          checked={param.value === true || param.value === 'true'}
          disabled={readOnly}
          onChange={(e) => onChange({ value: e.target.checked })}
          className="accent-zegen-accent cursor-pointer"
        />
      ) : (
        <input
          type={param.type === 'number' ? 'number' : 'text'}
          value={localValue}
          disabled={readOnly}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="flex-1 chrome-surface-2 border rounded px-2 py-0.5 chrome-text"
          placeholder={
            param.type === 'variable' ? 'e.g. Card.pin or $myVar' : 'value'
          }
        />
      )}

      {param.type === 'variable' && (
        <span
          className="text-[10px] chrome-dim truncate max-w-[10rem]"
          title="Runtime-resolved variable binding"
        >
          🔗 resolves at runtime
        </span>
      )}
    </div>
  );
}
