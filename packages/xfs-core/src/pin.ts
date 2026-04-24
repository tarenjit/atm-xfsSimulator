/** PIN Pad / Encrypting PIN Pad command and event contracts. */

export const PIN_CMD = {
  GET_PIN: 'WFS_CMD_PIN_GET_PIN',
  GET_PINBLOCK: 'WFS_CMD_PIN_GET_PINBLOCK',
  GET_DATA: 'WFS_CMD_PIN_GET_DATA',
  RESET: 'WFS_CMD_PIN_RESET',
  IMPORT_KEY: 'WFS_CMD_PIN_IMPORT_KEY',
  GET_KEY_DETAIL: 'WFS_CMD_PIN_GET_KEY_DETAIL',
} as const;

export type PinCommandCode = (typeof PIN_CMD)[keyof typeof PIN_CMD];

export const PIN_EVT = {
  KEY: 'WFS_EXEE_PIN_KEY',
  ENTER_DATA: 'WFS_EXEE_PIN_ENTERDATA',
  DATA_READY: 'WFS_EXEE_PIN_DATAREADY',
} as const;

export type PinEventCode = (typeof PIN_EVT)[keyof typeof PIN_EVT];

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
