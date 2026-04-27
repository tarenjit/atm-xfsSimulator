/**
 * Minimal APDU command parser per ISO 7816-4.
 *
 * APDU command format (case 1-4):
 *   CLA INS P1 P2 [Lc data...] [Le]
 *
 * For our EMV L2 simulator we only need to detect the command class and
 * the AID/data payload — full case-discrimination is overkill.
 */

export interface ParsedApdu {
  cla: number;
  ins: number;
  p1: number;
  p2: number;
  lc: number;
  data: Uint8Array;
  le: number;
}

export function parseApdu(hexOrBytes: string | Uint8Array): ParsedApdu {
  const bytes = typeof hexOrBytes === 'string' ? hexToBytes(hexOrBytes) : hexOrBytes;
  if (bytes.length < 4) {
    throw new Error(`APDU too short: ${bytes.length} bytes`);
  }
  // Length-checked above (bytes.length >= 4), so indices 0-3 are guaranteed.
  const cla = bytes[0]!;
  const ins = bytes[1]!;
  const p1 = bytes[2]!;
  const p2 = bytes[3]!;

  // Case 1: CLA INS P1 P2 (no Lc/Le).
  if (bytes.length === 4) {
    return { cla, ins, p1, p2, lc: 0, data: new Uint8Array(0), le: 0 };
  }
  // Case 2: CLA INS P1 P2 Le.
  if (bytes.length === 5) {
    return { cla, ins, p1, p2, lc: 0, data: new Uint8Array(0), le: bytes[4]! };
  }
  // Case 3 / Case 4: CLA INS P1 P2 Lc data... [Le].
  const lc = bytes[4]!;
  if (bytes.length < 5 + lc) {
    throw new Error(`APDU truncated: declared Lc=${lc} but only ${bytes.length - 5} data bytes`);
  }
  const data = bytes.slice(5, 5 + lc);
  const le = bytes.length === 5 + lc ? 0 : bytes[5 + lc]!;
  return { cla, ins, p1, p2, lc, data, le };
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/\s+/g, '');
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Hex string must have even length, got ${cleaned.length}`);
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex at position ${i * 2}: "${cleaned.substring(i * 2, i * 2 + 2)}"`);
    }
    out[i] = byte;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array | number[]): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}
