import { FIELDS, FieldDef, FieldKind } from './fields';
import { bitmapToFields, fieldsToBitmap } from './bitmap';

export type FieldValues = Record<number, string>;

export interface IsoMessage {
  mti: string;
  fields: FieldValues;
}

/**
 * Encode an ISO 8583 message to an ASCII wire string:
 *     MTI (4) + primary bitmap (16 hex) + fields in ascending order
 *
 * Field values must already be strings (caller formats amounts, dates, etc.).
 */
export function encodeMessage(msg: IsoMessage): string {
  const fieldNumbers = Object.keys(msg.fields)
    .map((k) => Number(k))
    .sort((a, b) => a - b);

  const bitmap = fieldsToBitmap(fieldNumbers);
  const parts: string[] = [msg.mti, bitmap];

  for (const f of fieldNumbers) {
    const def = FIELDS[f];
    if (!def) throw new Error(`unknown field ${f}`);
    const value = msg.fields[f] ?? '';
    parts.push(encodeField(def, value));
  }
  return parts.join('');
}

export function decodeMessage(wire: string): IsoMessage {
  if (wire.length < 20) throw new Error('message too short (need MTI + bitmap)');
  const mti = wire.slice(0, 4);
  const bitmapHex = wire.slice(4, 20);
  const fields = bitmapToFields(bitmapHex);

  let cursor = 20;
  const out: FieldValues = {};
  for (const f of fields) {
    const def = FIELDS[f];
    if (!def) throw new Error(`unknown field ${f}`);
    const { value, next } = decodeField(def, wire, cursor);
    out[f] = value;
    cursor = next;
  }
  if (cursor !== wire.length) {
    // Extra bytes — tolerate but warn via exception.
    throw new Error(`trailing bytes: parsed ${cursor}, got ${wire.length}`);
  }
  return { mti, fields: out };
}

function encodeField(def: FieldDef, raw: string): string {
  switch (def.kind) {
    case 'fixed':
      return raw.padEnd(def.length, ' ').slice(0, def.length);
    case 'numeric':
      return raw.replace(/\D/g, '').padStart(def.length, '0').slice(-def.length);
    case 'llvar': {
      if (raw.length > def.length) throw new Error(`field ${def.field} value too long`);
      return String(raw.length).padStart(2, '0') + raw;
    }
    case 'lllvar': {
      if (raw.length > def.length) throw new Error(`field ${def.field} value too long`);
      return String(raw.length).padStart(3, '0') + raw;
    }
    default:
      throw new Error(`unsupported field kind: ${def.kind as FieldKind}`);
  }
}

function decodeField(
  def: FieldDef,
  wire: string,
  start: number,
): { value: string; next: number } {
  switch (def.kind) {
    case 'fixed': {
      const end = start + def.length;
      return { value: wire.slice(start, end).trimEnd(), next: end };
    }
    case 'numeric': {
      const end = start + def.length;
      return { value: wire.slice(start, end), next: end };
    }
    case 'llvar': {
      const len = parseInt(wire.slice(start, start + 2), 10);
      const valStart = start + 2;
      return { value: wire.slice(valStart, valStart + len), next: valStart + len };
    }
    case 'lllvar': {
      const len = parseInt(wire.slice(start, start + 3), 10);
      const valStart = start + 3;
      return { value: wire.slice(valStart, valStart + len), next: valStart + len };
    }
    default:
      throw new Error(`unsupported field kind: ${def.kind as FieldKind}`);
  }
}

/** Format a minor-unit amount as a fixed 12-digit field 4 value. */
export function formatAmount(amount: number, _minor = 0): string {
  if (amount < 0) throw new Error('amount must be non-negative');
  return String(amount).padStart(12, '0');
}

/** MMDDhhmmss (UTC) for field 7. */
export function formatTransmissionDateTime(d = new Date()): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${mm}${dd}${hh}${mi}${ss}`;
}
