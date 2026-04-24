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
            'w-8 h-10 rounded-md border-2 transition-colors',
            side === 'left' ? 'border-r-zegen-accent' : 'border-l-zegen-accent',
            fdk.enabled
              ? 'border-slate-600 hover:border-zegen-accent hover:bg-slate-800 cursor-pointer'
              : 'border-slate-800 opacity-40 cursor-not-allowed',
          )}
        />
      ))}
    </div>
  );
}
