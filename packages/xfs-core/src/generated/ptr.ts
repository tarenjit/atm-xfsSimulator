// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.

/** PTR — Printer (receipt + journal). Thermal / inkjet / impact. */

export const PTR_HSERVICE_DEFAULT = 'PTR30' as const;

/** PTR command codes. */
export const PTR_CMD = {
  PRINT_FORM: 'WFS_CMD_PTR_PRINT_FORM',
  RAW_DATA: 'WFS_CMD_PTR_RAW_DATA',
  CUT_PAPER: 'WFS_CMD_PTR_CUT_PAPER',
  RESET: 'WFS_CMD_PTR_RESET',
} as const;

export type PtrCommandCode = (typeof PTR_CMD)[keyof typeof PTR_CMD];

/** PTR event codes. */
export const PTR_EVT = {
  PAPER_THRESHOLD: 'WFS_SRVE_PTR_PAPERTHRESHOLD',
  MEDIA_PRESENTED: 'WFS_SRVE_PTR_MEDIAPRESENTED',
  MEDIA_TAKEN: 'WFS_SRVE_PTR_MEDIATAKEN',
} as const;

export type PtrEventCode = (typeof PTR_EVT)[keyof typeof PTR_EVT];

/** Maps each PTR event code to its XFS event class. */
export const PTR_EVT_CLASS = {
  'WFS_SRVE_PTR_PAPERTHRESHOLD': 'SRVE',
  'WFS_SRVE_PTR_MEDIAPRESENTED': 'SRVE',
  'WFS_SRVE_PTR_MEDIATAKEN': 'SRVE',
} as const;
