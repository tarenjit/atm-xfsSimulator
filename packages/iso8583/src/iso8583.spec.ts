import {
  IsoMti,
  IsoResponseCode,
  bitmapToFields,
  decodeMessage,
  describeResponseCode,
  encodeMessage,
  fieldsToBitmap,
  formatAmount,
  formatTransmissionDateTime,
  isApproved,
} from './index';

describe('iso8583 bitmap', () => {
  it('encodes and decodes bit 2', () => {
    const b = fieldsToBitmap([2]);
    expect(b).toHaveLength(16);
    // Bit 2 set ⇒ second MSB of first nibble
    expect(b.startsWith('4')).toBe(true);
    expect(bitmapToFields(b)).toEqual([2]);
  });

  it('round-trips a typical ATM field set', () => {
    const fields = [2, 3, 4, 7, 11, 39, 41];
    const hex = fieldsToBitmap(fields);
    expect(bitmapToFields(hex).sort((a, b) => a - b)).toEqual(fields);
  });

  it('rejects fields > 64', () => {
    expect(() => fieldsToBitmap([65])).toThrow();
  });
});

describe('iso8583 codec', () => {
  it('encodes + decodes a 0200 financial request', () => {
    const msg = {
      mti: IsoMti.FINANCIAL_REQUEST,
      fields: {
        2: '4580123456787234',
        3: '012000',
        4: formatAmount(500_000),
        11: '000001',
        41: 'ZGN00001',
        49: '360', // IDR
      },
    };
    const wire = encodeMessage(msg);
    const decoded = decodeMessage(wire);
    expect(decoded.mti).toBe(IsoMti.FINANCIAL_REQUEST);
    expect(decoded.fields[2]).toBe('4580123456787234');
    expect(decoded.fields[4]).toBe('000000500000');
    expect(decoded.fields[11]).toBe('000001');
    expect(decoded.fields[41]).toBe('ZGN00001');
    expect(decoded.fields[49]).toBe('360');
  });

  it('encodes + decodes a 0210 response', () => {
    const msg = {
      mti: IsoMti.FINANCIAL_RESPONSE,
      fields: {
        11: '000001',
        38: '123456',
        39: IsoResponseCode.APPROVED,
        41: 'ZGN00001',
      },
    };
    const decoded = decodeMessage(encodeMessage(msg));
    expect(decoded.fields[39]).toBe('00');
    expect(decoded.fields[38]).toBe('123456');
  });

  it('rejects wire with trailing bytes', () => {
    const wire = encodeMessage({
      mti: '0200',
      fields: { 11: '000001' },
    });
    expect(() => decodeMessage(wire + 'XX')).toThrow('trailing');
  });

  it('rejects unknown field (in-range but undefined)', () => {
    // Field 50 is inside the primary bitmap range but not in FIELDS.
    expect(() =>
      encodeMessage({
        mti: '0200',
        fields: { 50: 'bogus' },
      }),
    ).toThrow('unknown field');
  });

  it('rejects field outside primary bitmap range', () => {
    expect(() =>
      encodeMessage({
        mti: '0200',
        fields: { 99: 'bogus' },
      }),
    ).toThrow('outside primary bitmap range');
  });
});

describe('formatting helpers', () => {
  it('formatAmount left-pads to 12 digits', () => {
    expect(formatAmount(500_000)).toBe('000000500000');
    expect(formatAmount(0)).toBe('000000000000');
    expect(() => formatAmount(-1)).toThrow();
  });

  it('formatTransmissionDateTime returns 10 digits in UTC', () => {
    const d = new Date(Date.UTC(2026, 3, 24, 14, 5, 30)); // April 24 2026
    expect(formatTransmissionDateTime(d)).toBe('0424140530');
  });
});

describe('response codes', () => {
  it('isApproved only for 00', () => {
    expect(isApproved(IsoResponseCode.APPROVED)).toBe(true);
    expect(isApproved(IsoResponseCode.NOT_SUFFICIENT_FUNDS)).toBe(false);
  });

  it('describeResponseCode returns a label', () => {
    expect(describeResponseCode(IsoResponseCode.NOT_SUFFICIENT_FUNDS)).toContain('not sufficient');
    expect(describeResponseCode('ZZ')).toContain('Unknown');
  });
});
