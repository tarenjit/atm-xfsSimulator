// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.

/** XFS event class identifiers per CEN/XFS 3.30. */
export const XFS_EVENT_CLASSES = [
  'SRVE',
  'USRE',
  'EXEE',
  'SYSE',
] as const;

export type XfsEventClassName = (typeof XFS_EVENT_CLASSES)[number];
