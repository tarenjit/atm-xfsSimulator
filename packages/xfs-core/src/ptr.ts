/** PTR (Printer) command and event contracts. */

export const PTR_CMD = {
  PRINT_FORM: 'WFS_CMD_PTR_PRINT_FORM',
  RAW_DATA: 'WFS_CMD_PTR_RAW_DATA',
  CUT_PAPER: 'WFS_CMD_PTR_CUT_PAPER',
  RESET: 'WFS_CMD_PTR_RESET',
} as const;

export type PtrCommandCode = (typeof PTR_CMD)[keyof typeof PTR_CMD];

export const PTR_EVT = {
  PAPER_THRESHOLD: 'WFS_SRVE_PTR_PAPERTHRESHOLD',
  MEDIA_PRESENTED: 'WFS_SRVE_PTR_MEDIAPRESENTED',
  MEDIA_TAKEN: 'WFS_SRVE_PTR_MEDIATAKEN',
} as const;

export type PtrEventCode = (typeof PTR_EVT)[keyof typeof PTR_EVT];

export type PtrFormName = 'RECEIPT' | 'JOURNAL' | 'STATEMENT';
export type PtrMediaType = 'RECEIPT' | 'JOURNAL';

export interface PtrPrintFormPayload {
  formName: PtrFormName;
  fields: Record<string, string>;
  mediaType: PtrMediaType;
  cut: boolean;
}

export interface PtrPrintFormResult {
  receiptId: string;
}

export interface PtrRawDataPayload {
  data: string;
}

export interface PtrRawDataResult {
  printed: boolean;
}

export interface PtrCapabilities {
  serviceClass: 'PTR';
  version: string;
  type: 'THERMAL' | 'INKJET' | 'IMPACT';
  canCut: boolean;
  paperCapacity: number;
}
