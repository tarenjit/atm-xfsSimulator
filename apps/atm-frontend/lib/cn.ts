import { clsx, ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combine Tailwind classes with clsx semantics. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
