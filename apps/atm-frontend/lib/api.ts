/**
 * Tiny fetch wrapper for the backend REST API.
 * Centralises the base URL + JSON parsing so components don't repeat boilerplate.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Build an absolute URL to the v1 REST surface — handy for things that
 *  must use a real URL rather than fetch (window.open for PDFs, etc.). */
export function apiUrl(path: string): string {
  return `${API_BASE}/api/v1${path}`;
}

export interface ApiOptions extends RequestInit {
  /** Request timeout in ms (default 10s). */
  timeoutMs?: number;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { timeoutMs = 10_000, headers, ...rest } = opts;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      ...rest,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      signal: ctl.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
