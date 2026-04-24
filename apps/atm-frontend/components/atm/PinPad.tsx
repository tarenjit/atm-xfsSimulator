'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  onKey: (key: string) => void;
  disabled?: boolean;
}

/**
 * Physical PIN pad. Digits 0-9, CLEAR, ENTER, CANCEL.
 * Also wires keyboard support for accessibility + testing.
 */
export function PinPad({ onKey, disabled }: Props) {
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) onKey(e.key);
      else if (e.key === 'Enter') onKey('ENTER');
      else if (e.key === 'Backspace') onKey('CLEAR');
      else if (e.key === 'Escape') onKey('CANCEL');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey, disabled]);

  const layout: Array<Array<{ label: string; key: string; kind?: 'fn' | 'digit' | 'danger' }>> = [
    [
      { label: '1', key: '1', kind: 'digit' },
      { label: '2', key: '2', kind: 'digit' },
      { label: '3', key: '3', kind: 'digit' },
    ],
    [
      { label: '4', key: '4', kind: 'digit' },
      { label: '5', key: '5', kind: 'digit' },
      { label: '6', key: '6', kind: 'digit' },
    ],
    [
      { label: '7', key: '7', kind: 'digit' },
      { label: '8', key: '8', kind: 'digit' },
      { label: '9', key: '9', kind: 'digit' },
    ],
    [
      { label: 'CANCEL', key: 'CANCEL', kind: 'danger' },
      { label: '0', key: '0', kind: 'digit' },
      { label: 'ENTER', key: 'ENTER', kind: 'fn' },
    ],
    [{ label: 'CLEAR', key: 'CLEAR', kind: 'fn' }],
  ];

  return (
    <div className="grid gap-2 w-full max-w-xs">
      {layout.map((row, i) => (
        <div
          key={i}
          className={cn('grid gap-2', row.length === 1 ? 'grid-cols-1' : 'grid-cols-3')}
        >
          {row.map(({ label, key, kind }) => (
            <button
              key={key}
              onClick={() => onKey(key)}
              disabled={disabled}
              className={cn(
                'py-4 rounded-lg font-mono font-semibold text-lg transition-colors',
                kind === 'digit' && 'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-600',
                kind === 'fn' && 'bg-zegen-accent text-slate-900 hover:bg-cyan-300',
                kind === 'danger' && 'bg-red-600 text-white hover:bg-red-500',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
