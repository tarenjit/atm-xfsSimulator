'use client';

import { cn } from '@/lib/cn';

export function CashTray({ active }: { active: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Cash tray</div>
      <div
        className={cn(
          'w-32 h-20 rounded-md border-2 border-slate-700 bg-slate-950/80 flex items-center justify-center transition-colors relative overflow-hidden',
          active && 'border-green-500/60',
        )}
      >
        {active && (
          <div className="w-20 h-10 rounded bg-gradient-to-br from-green-300 to-green-600 animate-pulse" />
        )}
      </div>
    </div>
  );
}
