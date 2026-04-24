/**
 * 64-bit primary bitmap encoded as 16 hex chars.
 * Bit N (1-based, 1..64) ↔ field N. Secondary bitmap not yet supported.
 */

export function fieldsToBitmap(fields: number[]): string {
  const bits = new Array(64).fill(0);
  for (const f of fields) {
    if (f < 1 || f > 64) throw new Error(`field ${f} outside primary bitmap range`);
    bits[f - 1] = 1;
  }
  let hex = '';
  for (let i = 0; i < 16; i++) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) {
      nibble = (nibble << 1) | bits[i * 4 + b];
    }
    hex += nibble.toString(16).toUpperCase();
  }
  return hex;
}

export function bitmapToFields(hex: string): number[] {
  if (hex.length !== 16) throw new Error(`bitmap must be 16 hex chars, got ${hex.length}`);
  const out: number[] = [];
  for (let i = 0; i < 16; i++) {
    const nibble = parseInt(hex[i] ?? '0', 16);
    for (let b = 0; b < 4; b++) {
      const bit = (nibble >> (3 - b)) & 1;
      if (bit === 1) out.push(i * 4 + b + 1);
    }
  }
  return out;
}
