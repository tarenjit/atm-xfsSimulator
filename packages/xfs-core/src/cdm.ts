/** CDM (Cash Dispenser Module) command and event contracts.
 *
 * Command + event constants are spec-driven (Architecture_v3.md §4.4) — they
 * come from spec/xfs-contract.yaml via the generator. Payload-shape
 * interfaces below are hand-written.
 */

export {
  CDM_CMD,
  CDM_EVT,
  CDM_EVT_CLASS,
  CDM_HSERVICE_DEFAULT,
  type CdmCommandCode,
  type CdmEventCode,
} from './generated/cdm';

export type CashUnitStatus = 'OK' | 'LOW' | 'EMPTY' | 'JAMMED' | 'INOPERATIVE';
export type CdmMixType = 'MIN_NOTES' | 'MAX_NOTES' | 'CUSTOM';

export interface CdmDispensePayload {
  /** Amount in minor units of currency (IDR has no minor units — whole Rp). */
  amount: number;
  currency: string;
  mixType: CdmMixType;
  /** Explicit denom → count map when mixType === 'CUSTOM'. */
  customMix?: Record<string, number>;
  /** Auto-present after dispense. */
  present: boolean;
}

export interface CdmDispenseResult {
  mix: Record<string, number>;
  totalDispensed: number;
}

export interface CdmPresentResult {
  amount: number;
}

export interface CdmCountResult {
  totalAmount: number;
  totalNotes: number;
}

export interface CashUnit {
  unitId: string;
  denomination: number;
  currency: string;
  status: CashUnitStatus;
  count: number;
  initialCount: number;
  maximum: number;
  minimum: number;
  rejectCount: number;
}

export interface CashUnitInfoResult {
  units: CashUnit[];
  totalDispensed: number;
  lastUpdated: string;
}

export interface CdmCapabilities {
  serviceClass: 'CDM';
  version: string;
  type: 'SELF_SERVICE' | 'TELLER';
  maxCassettes: number;
  currency: string;
  canPresent: boolean;
  canRetract: boolean;
  canRetain: boolean;
}
