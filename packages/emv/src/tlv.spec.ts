import { decodeTlv, encodeTlv, encodeTemplate, findTag } from './tlv';
import { bytesToHex } from './apdu';

describe('TLV codec', () => {
  it('encodes a primitive TLV with single-byte length', () => {
    const buf = encodeTlv('5A', '4580123456787234');
    // tag(1) + length(1) + value(8) = 10 bytes
    expect(buf.length).toBe(10);
    expect(bytesToHex(buf)).toBe('5A084580123456787234');
  });

  it('encodes 2-byte tags correctly', () => {
    const buf = encodeTlv('5F24', '281200');
    // tag(2) + length(1) + value(3) = 6 bytes
    expect(bytesToHex(buf)).toBe('5F2403281200');
  });

  it('encodes lengths 0x80–0xFF with 0x81 prefix', () => {
    const value = new Uint8Array(200);
    const buf = encodeTlv('5A', value);
    expect(buf[1]).toBe(0x81);
    expect(buf[2]).toBe(200);
    expect(buf.length).toBe(1 + 2 + 200);
  });

  it('encodes lengths 0x100–0xFFFF with 0x82 prefix', () => {
    const value = new Uint8Array(500);
    const buf = encodeTlv('5A', value);
    expect(buf[1]).toBe(0x82);
    expect(buf[2]).toBe(0x01);
    expect(buf[3]).toBe(0xf4);
    expect(buf.length).toBe(1 + 3 + 500);
  });

  it('encodeTemplate wraps children in a constructed tag', () => {
    const child1 = encodeTlv('82', '5C00');
    const child2 = encodeTlv('94', '08010100');
    const template = encodeTemplate('77', [child1, child2]);
    const decoded = decodeTlv(template);
    expect(decoded[0]?.tag).toBe('77');
    expect(decoded[0]?.isConstructed).toBe(true);
    expect(decoded[0]?.children).toHaveLength(2);
    expect(decoded[0]?.children[0]?.tag).toBe('82');
    expect(decoded[0]?.children[1]?.tag).toBe('94');
  });

  it('decodes a flat TLV stream', () => {
    const tlv = decodeTlv('5A084580123456787234' + '5F2403281200');
    expect(tlv).toHaveLength(2);
    expect(tlv[0]?.tag).toBe('5A');
    expect(tlv[1]?.tag).toBe('5F24');
  });

  it('decodes constructed templates recursively', () => {
    const inner = encodeTlv('5A', '4580');
    const outer = encodeTemplate('70', [inner]);
    const decoded = decodeTlv(outer);
    expect(decoded[0]?.isConstructed).toBe(true);
    expect(decoded[0]?.children[0]?.tag).toBe('5A');
  });

  it('findTag locates nested tags', () => {
    const inner = encodeTlv('9F26', 'AABBCCDDEEFF1122');
    const outer = encodeTemplate('77', [inner]);
    const tlv = decodeTlv(outer);
    const found = findTag(tlv, '9F26');
    expect(found).toBeDefined();
    expect(bytesToHex(found!.value)).toBe('AABBCCDDEEFF1122');
  });

  it('findTag returns undefined when missing', () => {
    const tlv = decodeTlv(encodeTlv('5A', '00'));
    expect(findTag(tlv, '9F26')).toBeUndefined();
  });

  it('throws on truncated value', () => {
    expect(() => decodeTlv('5A0812')).toThrow('TLV value out of range');
  });
});
