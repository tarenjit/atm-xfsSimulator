// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.

/** CDM — Cash Dispenser Module. Cassettes, denomination mix, present/retract. */

export const CDM_HSERVICE_DEFAULT = 'CDM30' as const;

/** CDM command codes. */
export const CDM_CMD = {
  DISPENSE: 'WFS_CMD_CDM_DISPENSE',
  PRESENT: 'WFS_CMD_CDM_PRESENT',
  REJECT: 'WFS_CMD_CDM_REJECT',
  RETRACT: 'WFS_CMD_CDM_RETRACT',
  COUNT: 'WFS_CMD_CDM_COUNT',
  CASH_UNIT_INFO: 'WFS_CMD_CDM_CASH_UNIT_INFO',
  START_EXCHANGE: 'WFS_CMD_CDM_START_EXCHANGE',
  END_EXCHANGE: 'WFS_CMD_CDM_END_EXCHANGE',
  RESET: 'WFS_CMD_CDM_RESET',
} as const;

export type CdmCommandCode = (typeof CDM_CMD)[keyof typeof CDM_CMD];

/** CDM event codes. */
export const CDM_EVT = {
  CASH_UNIT_THRESHOLD: 'WFS_SRVE_CDM_CASHUNITTHRESHOLD',
  SAFE_DOOR_OPEN: 'WFS_SRVE_CDM_SAFEDOOROPEN',
  SAFE_DOOR_CLOSED: 'WFS_SRVE_CDM_SAFEDOORCLOSED',
  NOTES_PRESENTED: 'WFS_EXEE_CDM_NOTESPRESENTED',
  NOTES_TAKEN: 'WFS_SRVE_CDM_ITEMSTAKEN',
  JAM: 'WFS_SRVE_CDM_MEDIADETECTED',
  EXCHANGE_STATE_CHANGED: 'WFS_SRVE_CDM_EXCHANGESTATECHANGED',
} as const;

export type CdmEventCode = (typeof CDM_EVT)[keyof typeof CDM_EVT];

/** Maps each CDM event code to its XFS event class. */
export const CDM_EVT_CLASS = {
  'WFS_SRVE_CDM_CASHUNITTHRESHOLD': 'SRVE',
  'WFS_SRVE_CDM_SAFEDOOROPEN': 'SRVE',
  'WFS_SRVE_CDM_SAFEDOORCLOSED': 'SRVE',
  'WFS_EXEE_CDM_NOTESPRESENTED': 'EXEE',
  'WFS_SRVE_CDM_ITEMSTAKEN': 'SRVE',
  'WFS_SRVE_CDM_MEDIADETECTED': 'SRVE',
  'WFS_SRVE_CDM_EXCHANGESTATECHANGED': 'SRVE',
} as const;
