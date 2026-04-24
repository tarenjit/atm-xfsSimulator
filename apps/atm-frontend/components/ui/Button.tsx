'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'primary', size = 'md', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zegen-accent disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'lg' ? 'px-6 py-4 text-lg' : 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-zegen-accent text-slate-900 hover:bg-cyan-300',
        variant === 'secondary' && 'bg-slate-700 text-slate-100 hover:bg-slate-600',
        variant === 'ghost' && 'bg-transparent text-slate-200 hover:bg-slate-800',
        variant === 'danger' && 'bg-red-500 text-white hover:bg-red-400',
        className,
      )}
      {...rest}
    />
  );
});
