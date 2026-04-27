import { bytesToHex, hexToBytes, parseApdu } from './apdu';
import { encodeTemplate, encodeTlv } from './tlv';

export interface ApduResponse {
  /** Hex-encoded response data (without status word). Empty string if none. */
  data: string;
  /** Status word high byte, 2 hex chars. */
  sw1: string;
  /** Status word low byte, 2 hex chars. */
  sw2: string;
}

export interface EmvCardData {
  pan: string;                 // primary account number, digits only
  expiryDate: string;          // YYMM
  cardholderName: string;
  /** Card-side AID. Default to a Visa-like AID for simulator demos. */
  aid?: string;
}

const DEFAULT_AID = 'A0000000031010'; // Visa Credit/Debit
const PSE_NAME = '315041592E5359532E4444463031'; // "1PAY.SYS.DDF01"

const SW = {
  OK: { sw1: '90', sw2: '00' },
  WARNING_FILE_NOT_FOUND: { sw1: '6A', sw2: '82' },
  CONDITIONS_NOT_SATISFIED: { sw1: '69', sw2: '85' },
  INS_NOT_SUPPORTED: { sw1: '6D', sw2: '00' },
};

/**
 * Stateful EMV chip session. Constructed when the IDC service powers on the
 * chip; survives until power-off / card removal.
 */
export class EmvSimulator {
  private powered = false;
  private selectedAid: string | null = null;
  private atc = 0;            // Application Transaction Counter
  private currentRecord = 1;

  constructor(private readonly card: EmvCardData) {
    if (!/^\d{12,19}$/.test(card.pan)) {
      throw new Error(`EmvSimulator: invalid PAN (must be 12-19 digits)`);
    }
    if (!/^\d{4}$/.test(card.expiryDate)) {
      throw new Error(`EmvSimulator: invalid expiryDate (must be YYMM)`);
    }
  }

  /** Power on; returns the ATR string (hex). */
  powerOn(): { atr: string } {
    this.powered = true;
    this.selectedAid = null;
    this.atc = 0;
    return { atr: '3B6800000073C84013009000' };
  }

  powerOff(): void {
    this.powered = false;
    this.selectedAid = null;
  }

  isPowered(): boolean {
    return this.powered;
  }

  getAtc(): number {
    return this.atc;
  }

  /**
   * Route an APDU through the simulator. APDU is hex-encoded.
   *
   * Recognised commands:
   *   00 A4 04 00 0E 1PAY.SYS.DDF01    — SELECT PSE
   *   00 A4 04 00 ?? <AID>             — SELECT AID
   *   80 A8 ...                         — GET PROCESSING OPTIONS
   *   00 B2 ?? ??                       — READ RECORD
   *   80 AE ...                         — GENERATE AC
   *
   * Anything else returns 6D 00 (INS not supported).
   */
  transmitApdu(payload: { apdu: string }): ApduResponse {
    if (!this.powered) {
      throw new Error('Chip not powered — call powerOn() first');
    }
    const apdu = parseApdu(payload.apdu);

    // SELECT (any select case starts with CLA=00 INS=A4)
    if (apdu.cla === 0x00 && apdu.ins === 0xa4) {
      return this.handleSelect(bytesToHex(apdu.data));
    }
    // GET PROCESSING OPTIONS — CLA 80 INS A8
    if (apdu.cla === 0x80 && apdu.ins === 0xa8) {
      return this.handleGpo();
    }
    // READ RECORD — CLA 00 INS B2 (P1=record number)
    if (apdu.cla === 0x00 && apdu.ins === 0xb2) {
      return this.handleReadRecord(apdu.p1);
    }
    // GENERATE AC — CLA 80 INS AE
    if (apdu.cla === 0x80 && apdu.ins === 0xae) {
      return this.handleGenerateAc();
    }

    return { data: '', ...SW.INS_NOT_SUPPORTED };
  }

  // -------------------------------------------------------------------------
  // Command handlers.
  // -------------------------------------------------------------------------

  private handleSelect(payloadHex: string): ApduResponse {
    if (payloadHex.toUpperCase() === PSE_NAME) {
      // SELECT PSE — return File Control Information for 1PAY.SYS.DDF01
      const fci = encodeTemplate('6F', [
        encodeTlv('84', PSE_NAME),
        encodeTemplate('A5', [encodeTlv('88', '01')]),
      ]);
      return { data: bytesToHex(fci), ...SW.OK };
    }
    // Treat the payload as a candidate AID; accept anything reasonable.
    if (/^[0-9A-F]{10,32}$/.test(payloadHex.toUpperCase())) {
      this.selectedAid = payloadHex.toUpperCase();
      // FCI for the selected app: AID, app label "VISA DEBIT".
      const fci = encodeTemplate('6F', [
        encodeTlv('84', this.selectedAid),
        encodeTemplate('A5', [
          encodeTlv('50', Buffer.from('VISA DEBIT', 'ascii').toString('hex')),
          encodeTlv('87', '01'),
        ]),
      ]);
      return { data: bytesToHex(fci), ...SW.OK };
    }
    return { data: '', ...SW.WARNING_FILE_NOT_FOUND };
  }

  private handleGpo(): ApduResponse {
    if (!this.selectedAid) {
      return { data: '', ...SW.CONDITIONS_NOT_SATISFIED };
    }
    // Format 2: response template '77' with AIP (tag 82) and AFL (tag 94).
    const aip = '5C00';                                // online-capable, SDA, DDA bits set
    const afl = '08010100100101011801010020010100';  // 4 records across 4 SFIs
    const template = encodeTemplate('77', [
      encodeTlv('82', aip),
      encodeTlv('94', afl),
    ]);
    return { data: bytesToHex(template), ...SW.OK };
  }

  private handleReadRecord(record: number): ApduResponse {
    if (!this.selectedAid) {
      return { data: '', ...SW.CONDITIONS_NOT_SATISFIED };
    }
    this.currentRecord = record;
    // Simplified record: PAN (5A), expiry (5F24), cardholder name (5F20).
    const panHex = this.padHex(this.card.pan);
    const expiry = this.card.expiryDate + '00'; // YYMMDD-style padding
    const nameHex = Buffer.from(this.card.cardholderName.padEnd(26).slice(0, 26), 'ascii')
      .toString('hex')
      .toUpperCase();
    const template = encodeTemplate('70', [
      encodeTlv('5A', panHex),
      encodeTlv('5F24', expiry),
      encodeTlv('5F20', nameHex),
    ]);
    return { data: bytesToHex(template), ...SW.OK };
  }

  private handleGenerateAc(): ApduResponse {
    if (!this.selectedAid) {
      return { data: '', ...SW.CONDITIONS_NOT_SATISFIED };
    }
    this.atc++;
    const atcHex = this.atc.toString(16).padStart(4, '0').toUpperCase();
    // Response template '77' with:
    //   9F27 — Cryptogram Information Data (40 = TC, 80 = ARQC)
    //   9F36 — ATC
    //   9F26 — Application Cryptogram (8 bytes; deterministic fake)
    //   9F10 — Issuer Application Data
    const arqc = this.deterministicArqc();
    const iad = '0110A04003240000000000000000000000FF';
    const template = encodeTemplate('77', [
      encodeTlv('9F27', '80'),       // 0x80 = ARQC
      encodeTlv('9F36', atcHex),
      encodeTlv('9F26', arqc),
      encodeTlv('9F10', iad),
    ]);
    return { data: bytesToHex(template), ...SW.OK };
  }

  // -------------------------------------------------------------------------
  // Helpers.
  // -------------------------------------------------------------------------

  /** Pad a numeric PAN to even-length hex with trailing F nibble per EMV. */
  private padHex(pan: string): string {
    const padded = pan.length % 2 === 0 ? pan : pan + 'F';
    return padded.toUpperCase();
  }

  /**
   * 8-byte deterministic "ARQC". Real ARQC = MAC over CDOL1 with issuer-
   * derived UDK; we hash PAN+ATC for repeatability in tests. NOT acceptable
   * for any real authorization — host emulator approves regardless.
   */
  private deterministicArqc(): string {
    const seed = `${this.card.pan}|${this.atc}|${this.selectedAid ?? ''}`;
    let hash = 0xcbf29ce484222325n; // FNV-1a 64-bit offset basis
    for (const ch of seed) {
      hash ^= BigInt(ch.charCodeAt(0));
      hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    const buf = new Uint8Array(8);
    let v = hash;
    for (let i = 7; i >= 0; i--) {
      buf[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return bytesToHex(buf);
  }

  /** Currently-selected record number (test introspection). */
  getCurrentRecord(): number {
    return this.currentRecord;
  }

  /** Currently-selected AID (test introspection). */
  getSelectedAid(): string | null {
    return this.selectedAid;
  }

  static defaultAid(): string {
    return DEFAULT_AID;
  }
}
