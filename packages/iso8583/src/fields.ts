/**
 * ISO 8583 field definitions used by the ATM host subset.
 *
 * Encoding is ASCII / variable-length with length prefixes — simpler than
 * the real EBCDIC / binary bitmap used by some issuers, but produces legible
 * test traces and is fully decodable.
 *
 * Layout:
 *   fixed(n)    → exactly n chars, right-padded with spaces on encode,
 *                  trimmed on decode.
 *   llvar(n)    → 2-digit ASCII length + up to n chars.
 *   lllvar(n)   → 3-digit ASCII length + up to n chars.
 *   numeric(n)  → exactly n digits, left-padded with '0'.
 */
export type FieldKind = 'fixed' | 'llvar' | 'lllvar' | 'numeric';

export interface FieldDef {
  field: number;
  kind: FieldKind;
  length: number;
  description: string;
}

/**
 * Subset of ISO 8583 fields needed for ATM-style messages.
 * Based on 1987 revision field numbers.
 */
export const FIELDS: Record<number, FieldDef> = {
  2: { field: 2, kind: 'llvar', length: 19, description: 'Primary Account Number' },
  3: { field: 3, kind: 'numeric', length: 6, description: 'Processing Code' },
  4: { field: 4, kind: 'numeric', length: 12, description: 'Transaction Amount' },
  7: { field: 7, kind: 'numeric', length: 10, description: 'Transmission Date & Time (MMDDhhmmss)' },
  11: { field: 11, kind: 'numeric', length: 6, description: 'STAN' },
  12: { field: 12, kind: 'numeric', length: 6, description: 'Time, Local (hhmmss)' },
  13: { field: 13, kind: 'numeric', length: 4, description: 'Date, Local (MMDD)' },
  14: { field: 14, kind: 'numeric', length: 4, description: 'Expiry Date (YYMM)' },
  22: { field: 22, kind: 'numeric', length: 3, description: 'POS Entry Mode' },
  37: { field: 37, kind: 'fixed', length: 12, description: 'Retrieval Reference Number' },
  38: { field: 38, kind: 'fixed', length: 6, description: 'Authorisation ID' },
  39: { field: 39, kind: 'fixed', length: 2, description: 'Response Code' },
  41: { field: 41, kind: 'fixed', length: 8, description: 'Terminal ID' },
  42: { field: 42, kind: 'fixed', length: 15, description: 'Card Acceptor ID' },
  49: { field: 49, kind: 'numeric', length: 3, description: 'Currency Code' },
  52: { field: 52, kind: 'fixed', length: 16, description: 'PIN Data (hex)' },
  54: { field: 54, kind: 'lllvar', length: 120, description: 'Additional Amounts' },
  70: { field: 70, kind: 'numeric', length: 3, description: 'Network Management Info Code' },
};
