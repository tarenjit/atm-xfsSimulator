'use client';

import { cn } from '@/lib/cn';
import type { ThemeMode } from '@/hooks/useThemeMode';

interface Props {
  deploymentName: string;
  atmName: string;
  atmIp: string;
  vendor: string;
  model: string;
  connected: boolean;
  state: string;
  mode: ThemeMode;
  onToggleMode: () => void;
}

export function HeaderBar({
  deploymentName,
  atmName,
  atmIp,
  vendor,
  model,
  connected,
  state,
  mode,
  onToggleMode,
}: Props) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 px-5 py-3 flex items-center justify-between text-xs">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-zegen-accent flex items-center justify-center font-bold text-slate-900">
          Z
        </div>
        <div>
          <div className="font-semibold text-slate-100">ATMirror</div>
          <div className="text-slate-500">{deploymentName}</div>
        </div>
      </div>

      <div className="hidden md:flex flex-1 items-center justify-center gap-2 font-mono text-slate-400">
        <span>{atmName}</span>
        <span className="text-slate-600">({atmIp})</span>
        <span className="text-slate-500">
          {vendor}/{model}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="font-mono">
          state: <span className="text-zegen-accent">{state}</span>
        </div>

        <ThemeToggle mode={mode} onToggle={onToggleMode} />

        <div
          className={cn(
            'flex items-center gap-2',
            connected ? 'text-green-400' : 'text-red-400',
          )}
        >
          <span className="w-2 h-2 rounded-full bg-current" />
          {connected ? 'connected' : 'disconnected'}
        </div>
      </div>
    </header>
  );
}

function ThemeToggle({ mode, onToggle }: { mode: ThemeMode; onToggle: () => void }) {
  const isDark = mode === 'dark';
  return (
    <button
      onClick={onToggle}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className={cn(
        'flex items-center gap-2 rounded-full px-1 py-1 border transition-colors',
        isDark
          ? 'bg-slate-800 border-slate-700 hover:border-zegen-accent'
          : 'bg-slate-200 border-slate-300 hover:border-zegen-accent',
      )}
    >
      <span
        className={cn('text-sm transition-opacity', isDark ? 'opacity-40' : 'opacity-100')}
        aria-hidden
      >
        ☀
      </span>
      <span
        className={cn(
          'w-8 h-4 rounded-full relative transition-colors',
          isDark ? 'bg-slate-600' : 'bg-zegen-accent',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
            isDark ? 'left-0.5' : 'left-[1.125rem]',
          )}
        />
      </span>
      <span
        className={cn('text-sm transition-opacity', isDark ? 'opacity-100' : 'opacity-40')}
        aria-hidden
      >
        ☾
      </span>
    </button>
  );
}
