// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.

/** XFS result codes (negative = error). Generated from spec. */
export const XFS_RESULT_CODES = {
  SUCCESS: 0,
  ERR_CANCEL: -1,
  ERR_DEV_NOT_READY: -2,
  ERR_HARDWARE_ERROR: -3,
  ERR_INVALID_HSERVICE: -4,
  ERR_INTERNAL_ERROR: -5,
  ERR_TIMEOUT: -6,
  ERR_USER_ERROR: -7,
  ERR_UNSUPP_COMMAND: -8,
  ERR_SERVICE_NOT_FOUND: -9,
  ERR_LOCKED: -10,
  ERR_NOT_STARTED: -11,
} as const;

export type XfsResultCodeName = keyof typeof XFS_RESULT_CODES;
export type XfsResultCodeValue = (typeof XFS_RESULT_CODES)[XfsResultCodeName];
