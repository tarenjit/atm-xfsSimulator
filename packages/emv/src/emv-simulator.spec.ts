import { decodeTlv, findTag, bytesToHex } from './index';
import { EmvSimulator } from './emv-simulator';

const SAMPLE_CARD = {
  pan: '4580123456787234',
  expiryDate: '2812',
  cardholderName: 'BAJWA/TESTING',
};

describe('EmvSimulator', () => {
  it('rejects invalid PAN at construction', () => {
    expect(() => new EmvSimulator({ ...SAMPLE_CARD, pan: '12' })).toThrow('invalid PAN');
  });

  it('rejects invalid expiry at construction', () => {
    expect(() => new EmvSimulator({ ...SAMPLE_CARD, expiryDate: '2024-12' })).toThrow(
      'invalid expiryDate',
    );
  });

  it('powerOn returns ATR and resets state', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    const { atr } = emv.powerOn();
    expect(atr).toBe('3B6800000073C84013009000');
    expect(emv.isPowered()).toBe(true);
    expect(emv.getAtc()).toBe(0);
    expect(emv.getSelectedAid()).toBeNull();
  });

  it('transmitApdu before powerOn throws', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    expect(() => emv.transmitApdu({ apdu: '00A4040007A0000000031010' })).toThrow(
      'Chip not powered',
    );
  });

  it('SELECT PSE returns FCI for 1PAY.SYS.DDF01', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    emv.powerOn();
    const r = emv.transmitApdu({
      apdu: '00A404000E315041592E5359532E444446303100',
    });
    expect(r.sw1).toBe('90');
    expect(r.sw2).toBe('00');
    const tlv = decodeTlv(r.data);
    const fci = findTag(tlv, '6F');
    expect(fci).toBeDefined();
    const dfName = findTag(tlv, '84');
    expect(dfName?.tag).toBe('84');
    expect(bytesToHex(dfName!.value)).toBe('315041592E5359532E4444463031');
  });

  it('SELECT AID stores the AID and returns FCI containing the app label', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    emv.powerOn();
    const r = emv.transmitApdu({ apdu: '00A4040007A000000003101000' });
    expect(r.sw1).toBe('90');
    expect(emv.getSelectedAid()).toBe('A0000000031010');
    const tlv = decodeTlv(r.data);
    const label = findTag(tlv, '50');
    expect(label).toBeDefined();
    expect(Buffer.from(label!.value).toString('ascii')).toBe('VISA DEBIT');
  });

  it('GPO before SELECT AID returns conditions-not-satisfied', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    emv.powerOn();
    const r = emv.transmitApdu({ apdu: '80A8000002830000' });
    expect(r.sw1).toBe('69');
    expect(r.sw2).toBe('85');
  });

  it('GPO after SELECT AID returns AIP + AFL inside response template 77', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    emv.powerOn();
    emv.transmitApdu({ apdu: '00A4040007A000000003101000' });
    const r = emv.transmitApdu({ apdu: '80A8000002830000' });
    expect(r.sw1).toBe('90');
    const tlv = decodeTlv(r.data);
    expect(findTag(tlv, '77')).toBeDefined();
    expect(findTag(tlv, '82')).toBeDefined(); // AIP
    expect(findTag(tlv, '94')).toBeDefined(); // AFL
  });

  it('READ RECORD returns PAN + expiry + cardholder name TLVs', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    emv.powerOn();
    emv.transmitApdu({ apdu: '00A4040007A000000003101000' });
    const r = emv.transmitApdu({ apdu: '00B2010C00' });
    expect(r.sw1).toBe('90');
    const tlv = decodeTlv(r.data);
    const pan = findTag(tlv, '5A');
    expect(pan).toBeDefined();
    expect(bytesToHex(pan!.value)).toContain(SAMPLE_CARD.pan);
    const exp = findTag(tlv, '5F24');
    expect(exp).toBeDefined();
    const name = findTag(tlv, '5F20');
    expect(name).toBeDefined();
    expect(Buffer.from(name!.value).toString('ascii').trim()).toBe(SAMPLE_CARD.cardholderName);
  });

  it('GENERATE AC increments ATC and returns ARQC + ATC TLVs', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    emv.powerOn();
    emv.transmitApdu({ apdu: '00A4040007A000000003101000' });
    expect(emv.getAtc()).toBe(0);

    const r1 = emv.transmitApdu({ apdu: '80AE800000' });
    expect(r1.sw1).toBe('90');
    expect(emv.getAtc()).toBe(1);
    const tlv1 = decodeTlv(r1.data);
    const atc1 = findTag(tlv1, '9F36');
    expect(bytesToHex(atc1!.value)).toBe('0001');
    const arqc1 = findTag(tlv1, '9F26');
    expect(arqc1!.value.length).toBe(8);

    // Second call increments ATC and (because ATC is part of the seed)
    // produces a different ARQC.
    const r2 = emv.transmitApdu({ apdu: '80AE800000' });
    expect(emv.getAtc()).toBe(2);
    const tlv2 = decodeTlv(r2.data);
    const atc2 = findTag(tlv2, '9F36');
    expect(bytesToHex(atc2!.value)).toBe('0002');
    const arqc2 = findTag(tlv2, '9F26');
    expect(bytesToHex(arqc2!.value)).not.toBe(bytesToHex(arqc1!.value));
  });

  it('ARQC is deterministic across simulator instances for the same PAN+ATC', () => {
    const a = new EmvSimulator(SAMPLE_CARD);
    a.powerOn();
    a.transmitApdu({ apdu: '00A4040007A000000003101000' });
    const ra = a.transmitApdu({ apdu: '80AE800000' });

    const b = new EmvSimulator(SAMPLE_CARD);
    b.powerOn();
    b.transmitApdu({ apdu: '00A4040007A000000003101000' });
    const rb = b.transmitApdu({ apdu: '80AE800000' });

    expect(ra.data).toBe(rb.data);
  });

  it('unknown APDU returns 6D 00', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    emv.powerOn();
    const r = emv.transmitApdu({ apdu: '00FF000000' });
    expect(r.sw1).toBe('6D');
    expect(r.sw2).toBe('00');
  });

  it('powerOff clears state', () => {
    const emv = new EmvSimulator(SAMPLE_CARD);
    emv.powerOn();
    emv.transmitApdu({ apdu: '00A4040007A000000003101000' });
    emv.powerOff();
    expect(emv.isPowered()).toBe(false);
    expect(() => emv.transmitApdu({ apdu: '80AE800000' })).toThrow('Chip not powered');
  });
});
