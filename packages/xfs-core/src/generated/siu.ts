// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.

/** SIU — Sensors & Indicators Unit. Cabinet/safe doors, tamper, LEDs, supervisor key. */

export const SIU_HSERVICE_DEFAULT = 'SIU30' as const;

/** SIU command codes. */
export const SIU_CMD = {
  ENABLE_EVENTS: 'WFS_CMD_SIU_ENABLE_EVENTS',
  DISABLE_EVENTS: 'WFS_CMD_SIU_DISABLE_EVENTS',
  SET_INDICATOR: 'WFS_CMD_SIU_SET_INDICATOR',
  GET_SENSOR_STATUS: 'WFS_CMD_SIU_GET_SENSOR_STATUS',
  RESET: 'WFS_CMD_SIU_RESET',
} as const;

export type SiuCommandCode = (typeof SIU_CMD)[keyof typeof SIU_CMD];

/** SIU event codes. */
export const SIU_EVT = {
  PORT_STATUS: 'WFS_SRVE_SIU_PORT_STATUS',
  CABINET_STATUS: 'WFS_USRE_SIU_CABINET_STATUS',
  SAFE_DOOR: 'WFS_USRE_SIU_SAFE_DOOR',
  TAMPER_SENSOR: 'WFS_USRE_SIU_TAMPER_SENSOR',
  OPERATOR_SWITCH: 'WFS_USRE_SIU_OPERATOR_SWITCH',
} as const;

export type SiuEventCode = (typeof SIU_EVT)[keyof typeof SIU_EVT];

/** Maps each SIU event code to its XFS event class. */
export const SIU_EVT_CLASS = {
  'WFS_SRVE_SIU_PORT_STATUS': 'SRVE',
  'WFS_USRE_SIU_CABINET_STATUS': 'USRE',
  'WFS_USRE_SIU_SAFE_DOOR': 'USRE',
  'WFS_USRE_SIU_TAMPER_SENSOR': 'USRE',
  'WFS_USRE_SIU_OPERATOR_SWITCH': 'USRE',
} as const;
