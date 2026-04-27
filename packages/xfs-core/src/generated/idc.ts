// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.

/** IDC — Identification Card (card reader). Motor / DIP / contactless. */

export const IDC_HSERVICE_DEFAULT = 'IDC30' as const;

/** IDC command codes. */
export const IDC_CMD = {
  READ_RAW_DATA: 'WFS_CMD_IDC_READ_RAW_DATA',
  READ_TRACK: 'WFS_CMD_IDC_READ_TRACK',
  WRITE_TRACK: 'WFS_CMD_IDC_WRITE_TRACK',
  EJECT_CARD: 'WFS_CMD_IDC_EJECT_CARD',
  RETAIN_CARD: 'WFS_CMD_IDC_RETAIN_CARD',
  RESET_COUNT: 'WFS_CMD_IDC_RESET_COUNT',
  RESET: 'WFS_CMD_IDC_RESET',
  CHIP_IO: 'WFS_CMD_IDC_CHIP_IO',
  CHIP_POWER: 'WFS_CMD_IDC_CHIP_POWER',
} as const;

export type IdcCommandCode = (typeof IDC_CMD)[keyof typeof IDC_CMD];

/** IDC event codes. */
export const IDC_EVT = {
  MEDIA_INSERTED: 'WFS_SRVE_IDC_MEDIAINSERTED',
  MEDIA_REMOVED: 'WFS_SRVE_IDC_MEDIAREMOVED',
  MEDIA_RETAINED: 'WFS_SRVE_IDC_MEDIARETAINED',
  INVALID_TRACK_DATA: 'WFS_EXEE_IDC_INVALIDTRACKDATA',
  INVALID_MEDIA: 'WFS_EXEE_IDC_INVALIDMEDIA',
} as const;

export type IdcEventCode = (typeof IDC_EVT)[keyof typeof IDC_EVT];

/** Maps each IDC event code to its XFS event class. */
export const IDC_EVT_CLASS = {
  'WFS_SRVE_IDC_MEDIAINSERTED': 'SRVE',
  'WFS_SRVE_IDC_MEDIAREMOVED': 'SRVE',
  'WFS_SRVE_IDC_MEDIARETAINED': 'SRVE',
  'WFS_EXEE_IDC_INVALIDTRACKDATA': 'EXEE',
  'WFS_EXEE_IDC_INVALIDMEDIA': 'EXEE',
} as const;
