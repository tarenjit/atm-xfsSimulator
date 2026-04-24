'use client';

import { cn } from '@/lib/cn';
import type { FdkOption } from '@/types/atm';

interface Props {
  side: 'left' | 'right';
  fdks: FdkOption[]; // exactly 4
  onPress: (fdk: FdkOption) => void;
}

/**
 * Column of 4 Function Descriptor Keys alongside the blue screen.
 * Reference: ATMirage / Hyosung layout = 4 on each side.
 *
 * FDKs sit on the fascia, so they always use fascia colors — the page
 * light/dark toggle doesn't touch them.
 */
export function FdkColumn({ side, fdks, onPress }: Props) {
  return (
    <div className="flex flex-col justify-between py-2 gap-2">
      {fdks.map((fdk) => (
        <button
          key={fdk.slot}
          onClick={() => onPress(fdk)}
          disabled={!fdk.enabled}
          title={fdk.label || fdk.slot}
          className={cn(
            'w-8 h-10 rounded-md border-2 transition-colors shadow-inner',
            side === 'left' ? 'border-r-zegen-accent' : 'border-l-zegen-accent',
            fdk.enabled
              ? 'border-slate-500 bg-slate-700 hover:border-zegen-accent hover:bg-slate-600 cursor-pointer'
              : 'border-slate-700 bg-slate-800 opacity-50 cursor-not-allowed',
          )}
        />
      ))}
    </div>
  );
}
