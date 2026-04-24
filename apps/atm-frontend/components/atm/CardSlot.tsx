'use client';

import { cn } from '@/lib/cn';

export function CardSlot({ cardInserted }: { cardInserted: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Card slot</div>
      <div
        className={cn(
          'w-40 h-16 rounded-md border-2 border-slate-700 bg-slate-950/80 flex items-end justify-center relative overflow-hidden transition-all',
          cardInserted && 'border-zegen-accent/70',
        )}
      >
        <div
          className={cn(
            'w-28 h-10 rounded border border-slate-600 bg-gradient-to-br from-yellow-500 to-amber-700 transition-transform',
            cardInserted ? 'translate-y-0' : 'translate-y-full',
          )}
        />
      </div>
    </div>
  );
}
