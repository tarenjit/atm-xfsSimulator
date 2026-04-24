'use client';

import { cn } from '@/lib/cn';

export function CashTray({ active }: { active: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] uppercase tracking-widest fascia-label mb-1">Cash tray</div>
      <div
        className={cn(
          'w-32 h-20 rounded-md border-2 fascia-2 flex items-center justify-center transition-colors relative overflow-hidden',
          active ? 'border-green-500/70 shadow-[0_0_16px_rgba(34,197,94,0.3)]' : '',
        )}
      >
        {active && (
          <div className="w-20 h-10 rounded bg-gradient-to-br from-green-300 to-green-600 animate-pulse flex items-center justify-center text-[10px] font-semibold text-green-900">
            Rp
          </div>
        )}
      </div>
    </div>
  );
}
