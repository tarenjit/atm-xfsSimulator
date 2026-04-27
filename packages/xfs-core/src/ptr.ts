/** PTR (Printer) command and event contracts.
 *
 * Command + event constants are spec-driven (Architecture_v3.md §4.4) — they
 * come from spec/xfs-contract.yaml via the generator. Payload-shape
 * interfaces below are hand-written.
 */

export {
  PTR_CMD,
  PTR_EVT,
  PTR_EVT_CLASS,
  PTR_HSERVICE_DEFAULT,
  type PtrCommandCode,
  type PtrEventCode,
} from './generated/ptr';

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
