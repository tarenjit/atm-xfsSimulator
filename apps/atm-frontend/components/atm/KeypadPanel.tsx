'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  onKey: (key: string) => void;
}

/**
 * Physical numeric keypad matching the reference:
 *     1 2 3 | CANCEL
 *     4 5 6 | CLEAR
 *     7 8 9 | ENTER
 *       0 . | HELP
 *
 * Supports keyboard: digits, Enter, Backspace (→ CLEAR), Escape (→ CANCEL).
 */
export function KeypadPanel({ onKey }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when user is typing into an input/textarea.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (/^[0-9]$/.test(e.key)) onKey(e.key);
      else if (e.key === 'Enter') onKey('ENTER');
      else if (e.key === 'Backspace') onKey('CLEAR');
      else if (e.key === 'Escape') onKey('CANCEL');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey]);

  const digit = (label: string, key = label) => (
    <KeypadKey label={label} kind="digit" onClick={() => onKey(key)} />
  );

  return (
    <div
      className="grid grid-cols-4 gap-2 p-4 rounded-xl fascia-2 border-2 shadow-inner"
      style={{ width: 'fit-content' }}
    >
      {digit('1')}
      {digit('2')}
      {digit('3')}
      <KeypadKey label="CANCEL" kind="cancel" onClick={() => onKey('CANCEL')} />

      {digit('4')}
      {digit('5')}
      {digit('6')}
      <KeypadKey label="CLEAR" kind="fn" onClick={() => onKey('CLEAR')} />

      {digit('7')}
      {digit('8')}
      {digit('9')}
      <KeypadKey label="ENTER" kind="enter" onClick={() => onKey('ENTER')} />

      <KeypadKey label="" kind="blank" />
      {digit('0')}
      <KeypadKey label="." kind="digit" onClick={() => onKey('.')} />
      <KeypadKey label="HELP" kind="fn" onClick={() => onKey('HELP')} />
    </div>
  );
}

function KeypadKey({
  label,
  kind,
  onClick,
}: {
  label: string;
  kind: 'digit' | 'fn' | 'cancel' | 'enter' | 'blank';
  onClick?: () => void;
}) {
  if (kind === 'blank') return <div />;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-14 h-14 rounded font-mono font-semibold text-sm flex items-center justify-center transition-colors shadow-md active:translate-y-px active:shadow-sm',
        kind === 'digit' && 'key-digit',
        kind === 'fn' && 'key-fn text-xs',
        kind === 'cancel' && 'bg-red-600 text-white hover:bg-red-500 text-xs',
        kind === 'enter' && 'bg-green-600 text-white hover:bg-green-500 text-xs',
      )}
    >
      {label}
    </button>
  );
}
