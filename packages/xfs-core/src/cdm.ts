/** CDM (Cash Dispenser Module) command and event contracts. */

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

export const CDM_EVT = {
  CASH_UNIT_THRESHOLD: 'WFS_SRVE_CDM_CASHUNITTHRESHOLD',
  SAFE_DOOR_OPEN: 'WFS_SRVE_CDM_SAFEDOOROPEN',
  SAFE_DOOR_CLOSED: 'WFS_SRVE_CDM_SAFEDOORCLOSED',
  NOTES_PRESENTED: 'WFS_EXEE_CDM_NOTESPRESENTED',
  NOTES_TAKEN: 'WFS_SRVE_CDM_ITEMSTAKEN',
  /** Cassette jam — XFS 3.30 media-detected event with status=JAMMED. */
  JAM: 'WFS_SRVE_CDM_MEDIADETECTED',
  EXCHANGE_STATE_CHANGED: 'WFS_SRVE_CDM_EXCHANGESTATECHANGED',
} as const;

export type CdmEventCode = (typeof CDM_EVT)[keyof typeof CDM_EVT];

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
