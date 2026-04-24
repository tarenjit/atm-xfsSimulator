'use client';

import { cn } from '@/lib/cn';

/**
 * Card slot on the ATM fascia. Stays dark in both light and dark page
 * modes — real ATM plastic is always dark. The card itself animates in
 * from below when inserted.
 */
export function CardSlot({ cardInserted }: { cardInserted: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] uppercase tracking-widest fascia-label mb-1">Card slot</div>
      <div
        className={cn(
          'w-40 h-16 rounded-md border-2 fascia-2 flex items-end justify-center relative overflow-hidden transition-all',
          cardInserted ? 'border-zegen-accent/70 shadow-[0_0_12px_rgba(34,211,238,0.3)]' : '',
        )}
      >
        <div
          className={cn(
            'w-28 h-10 rounded border border-slate-600 bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-700 transition-transform duration-300 shadow-lg',
            cardInserted ? 'translate-y-0' : 'translate-y-full',
          )}
        >
          <div className="w-full h-full flex items-center justify-center text-[8px] font-semibold text-amber-900/70">
            ZEGEN
          </div>
        </div>
      </div>
    </div>
  );
}
