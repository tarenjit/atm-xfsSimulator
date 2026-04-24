'use client';

import { cn } from '@/lib/cn';

interface Props {
  deploymentName: string;
  atmName: string;
  atmIp: string;
  vendor: string;
  model: string;
  connected: boolean;
  state: string;
}

export function HeaderBar({
  deploymentName,
  atmName,
  atmIp,
  vendor,
  model,
  connected,
  state,
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
