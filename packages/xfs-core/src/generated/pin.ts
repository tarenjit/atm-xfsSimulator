// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.

/** PIN — PIN Pad / Encrypting PIN Pad (EPP). Captures PINs, derives PIN blocks. */

export const PIN_HSERVICE_DEFAULT = 'PIN30' as const;

/** PIN command codes. */
export const PIN_CMD = {
  GET_PIN: 'WFS_CMD_PIN_GET_PIN',
  GET_PINBLOCK: 'WFS_CMD_PIN_GET_PINBLOCK',
  GET_DATA: 'WFS_CMD_PIN_GET_DATA',
  RESET: 'WFS_CMD_PIN_RESET',
  IMPORT_KEY: 'WFS_CMD_PIN_IMPORT_KEY',
  GET_KEY_DETAIL: 'WFS_CMD_PIN_GET_KEY_DETAIL',
} as const;

export type PinCommandCode = (typeof PIN_CMD)[keyof typeof PIN_CMD];

/** PIN event codes. */
export const PIN_EVT = {
  KEY: 'WFS_EXEE_PIN_KEY',
  ENTER_DATA: 'WFS_EXEE_PIN_ENTERDATA',
  DATA_READY: 'WFS_EXEE_PIN_DATAREADY',
} as const;

export type PinEventCode = (typeof PIN_EVT)[keyof typeof PIN_EVT];

/** Maps each PIN event code to its XFS event class. */
export const PIN_EVT_CLASS = {
  'WFS_EXEE_PIN_KEY': 'EXEE',
  'WFS_EXEE_PIN_ENTERDATA': 'EXEE',
  'WFS_EXEE_PIN_DATAREADY': 'EXEE',
} as const;
