/** PIN Pad / Encrypting PIN Pad command and event contracts.
 *
 * Command + event constants are spec-driven (Architecture_v3.md §4.4) — they
 * come from spec/xfs-contract.yaml via the generator. Payload-shape
 * interfaces and FDK constants below are hand-written.
 */

export {
  PIN_CMD,
  PIN_EVT,
  PIN_EVT_CLASS,
  PIN_HSERVICE_DEFAULT,
  type PinCommandCode,
  type PinEventCode,
} from './generated/pin';

/**
 * FDK (Function Descriptor Key) codes per CEN/XFS.
 * Hyosung layout: 4 on left (A–D), 4 on right (E–H) of the display.
 */
export const FDK_CODES = {
  FDK_A: 'FDK01', // Top-left
  FDK_B: 'FDK02',
  FDK_C: 'FDK03',
  FDK_D: 'FDK04', // Bottom-left
  FDK_E: 'FDK05', // Top-right
  FDK_F: 'FDK06',
  FDK_G: 'FDK07',
  FDK_H: 'FDK08', // Bottom-right
} as const;

export type FdkCode = (typeof FDK_CODES)[keyof typeof FDK_CODES];

export const FDK_SLOTS = [
  'FDK_A',
  'FDK_B',
  'FDK_C',
  'FDK_D',
  'FDK_E',
  'FDK_F',
  'FDK_G',
  'FDK_H',
] as const;

export type PinBlockFormat = 'ISO0' | 'ISO1' | 'ISO3' | 'ANSI';

export interface PinGetPinPayload {
  minLen: number;
  maxLen: number;
  autoEnd: boolean;
  activeKeys: string[];
  activeFDKs: string[];
  terminateKeys: string[];
}

export interface PinGetPinResult {
  pinLength: number;
}

export interface PinGetPinBlockPayload {
  keyName: string;
  format: PinBlockFormat;
  pan: string;
}

export interface PinBlockResult {
  pinBlock: string;
  pinBlockFormat: PinBlockFormat;
  keyName: string;
}

export interface PinGetDataResult {
  data: string;
}

export interface PinCapabilities {
  serviceClass: 'PIN';
  version: string;
  type: 'EPP' | 'PINPAD';
  pinBlockFormats: PinBlockFormat[];
  keyFunctionModules: Array<'DES' | '3DES' | 'AES' | 'RSA'>;
  supportedKeys: string[];
}
