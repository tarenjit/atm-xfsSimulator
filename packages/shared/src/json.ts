/**
 * BigInt-safe JSON serializer. IDR amounts are stored as BigInt in Prisma;
 * native JSON.stringify throws on BigInt. Converts to string with a trailing
 * marker-free representation (callers decide if they want Number or string).
 */
export function stringifyBigInt(value: unknown, space?: number): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), space);
}

/**
 * Recursively convert BigInt values in an object tree to strings.
 * Dates and Buffers are preserved — they have no own enumerable properties
 * so a naive Object.entries descent would replace them with {}.
 */
export function bigIntToString<T>(value: T): T {
  if (typeof value === 'bigint') {
    return value.toString() as unknown as T;
  }
  if (value instanceof Date) {
    return value as T;
  }
  if (Buffer.isBuffer(value)) {
    return value as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => bigIntToString(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = bigIntToString(v);
    }
    return out as T;
  }
  return value;
}
