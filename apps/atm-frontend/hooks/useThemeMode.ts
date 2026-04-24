'use client';

import { useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'zegen.themeMode';

/**
 * Dark/light mode toggle with localStorage persistence.
 * Applies a `data-theme` attribute to <html> so CSS variables or
 * Tailwind arbitrary selectors can react without a full re-render.
 *
 * Initial SSR render always uses 'dark' (the app's default); the hook
 * rehydrates from localStorage on mount, then writes back on change.
 */
export function useThemeMode(): {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
} {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') {
        setModeState(stored);
      } else if (typeof window !== 'undefined' && window.matchMedia) {
        setModeState(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      }
    } catch {
      /* storage disabled — stay on default */
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    root.style.colorScheme = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* storage disabled */
    }
  }, [mode]);

  const setMode = (m: ThemeMode) => setModeState(m);
  const toggle = () => setModeState((m) => (m === 'dark' ? 'light' : 'dark'));
  return { mode, toggle, setMode };
}
