/**
 * Minimal BER-TLV codec covering the EMV tag space.
 *
 * Encoding rules (EMV-Book 3 §B):
 *   Tag:    1-3 bytes; high nibble of first byte includes a "more bytes" flag.
 *   Length: 1 byte if < 0x80, else 0x8N + N length bytes.
 *   Value:  raw bytes.
 *
 * We support 1-2 byte tags (covers all EMV-defined tags) and 1-2 byte
 * lengths (≤ 65535 — more than ample for any EMV record).
 */

import { bytesToHex, hexToBytes } from './apdu';

export interface TlvNode {
  tag: string;          // hex
  length: number;       // value length in bytes
  value: Uint8Array;    // raw value
  /** Constructed nodes have parsed children; primitive nodes have empty array. */
  children: TlvNode[];
  isConstructed: boolean;
}

export function encodeTlv(tagHex: string, value: Uint8Array | string): Uint8Array {
  const valueBytes = typeof value === 'string' ? hexToBytes(value) : value;
  const tagBytes = hexToBytes(tagHex);
  const lengthBytes = encodeLength(valueBytes.length);
  const out = new Uint8Array(tagBytes.length + lengthBytes.length + valueBytes.length);
  out.set(tagBytes, 0);
  out.set(lengthBytes, tagBytes.length);
  out.set(valueBytes, tagBytes.length + lengthBytes.length);
  return out;
}

export function encodeTemplate(tagHex: string, children: Uint8Array[]): Uint8Array {
  const total = children.reduce((n, c) => n + c.length, 0);
  const valueBuf = new Uint8Array(total);
  let off = 0;
  for (const c of children) {
    valueBuf.set(c, off);
    off += c.length;
  }
  return encodeTlv(tagHex, valueBuf);
}

export function decodeTlv(input: Uint8Array | string): TlvNode[] {
  const bytes = typeof input === 'string' ? hexToBytes(input) : input;
  const out: TlvNode[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tagStart = offset;
    // Tag: first byte; if low 5 bits are all set, additional tag bytes follow.
    const firstByte = bytes[offset++];
    if (firstByte === undefined) {
      throw new Error(`TLV truncated reading tag at offset ${offset}`);
    }
    if ((firstByte & 0x1f) === 0x1f) {
      // Multi-byte tag — read until top bit is clear.
      while (offset < bytes.length && ((bytes[offset] ?? 0) & 0x80) === 0x80) {
        offset++;
      }
      offset++; // include the terminator byte
    }
    const tag = bytesToHex(bytes.slice(tagStart, offset));

    const lenFirst = bytes[offset++];
    if (lenFirst === undefined) {
      throw new Error(`TLV truncated reading length at offset ${offset}`);
    }
    let length: number;
    if (lenFirst < 0x80) {
      length = lenFirst;
    } else {
      const numLenBytes = lenFirst & 0x7f;
      if (numLenBytes === 0 || numLenBytes > 4) {
        throw new Error(`Unsupported TLV length encoding at offset ${offset - 1}`);
      }
      length = 0;
      for (let i = 0; i < numLenBytes; i++) {
        const lenByte = bytes[offset++];
        if (lenByte === undefined) {
          throw new Error(`TLV truncated while reading length at offset ${offset}`);
        }
        length = (length << 8) | lenByte;
      }
    }
    if (offset + length > bytes.length) {
      throw new Error(
        `TLV value out of range at offset ${offset}: length=${length} but only ${bytes.length - offset} bytes left`,
      );
    }
    const value = bytes.slice(offset, offset + length);
    offset += length;

    // Constructed iff bit 6 of first tag byte is set (per BER).
    const isConstructed = (firstByte & 0x20) === 0x20;
    out.push({
      tag,
      length,
      value,
      isConstructed,
      children: isConstructed ? decodeTlv(value) : [],
    });
  }
  return out;
}

/** Find a node by exact tag in a flat or nested TLV tree. */
export function findTag(nodes: TlvNode[], tag: string): TlvNode | undefined {
  for (const n of nodes) {
    if (n.tag === tag.toUpperCase()) return n;
    if (n.isConstructed) {
      const child = findTag(n.children, tag);
      if (child) return child;
    }
  }
  return undefined;
}

function encodeLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);
  if (length < 0x100) return new Uint8Array([0x81, length]);
  if (length < 0x10000) return new Uint8Array([0x82, (length >> 8) & 0xff, length & 0xff]);
  throw new Error(`TLV length ${length} exceeds 2-byte limit`);
}
