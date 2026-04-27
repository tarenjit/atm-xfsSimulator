/**
 * ISO 8583 surface.
 *
 * Phase 1 exposed MTI enums + response codes.
 * Phase 6 adds a working encoder/decoder with primary bitmap and the
 * common ATM field subset (2, 3, 4, 7, 11, 12, 13, 14, 22, 37-42, 49, 52,
 * 54, 70).
 */
export * from './fields';
export * from './bitmap';
export * from './codec';
export * from './switches';

export enum IsoMti {
  AUTH_REQUEST = '0100',
  FINANCIAL_REQUEST = '0200',
  FINANCIAL_RESPONSE = '0210',
  REVERSAL = '0400',
  REVERSAL_RESPONSE = '0410',
  NETWORK_MGMT = '0800',
  NETWORK_MGMT_RESPONSE = '0810',
}

/** Field 39 — ISO 8583 Response Codes (subset most relevant to ATM). */
export const IsoResponseCode = {
  APPROVED: '00',
  REFER_TO_ISSUER: '01',
  INVALID_TRANSACTION: '12',
  INVALID_AMOUNT: '13',
  INVALID_CARD: '14',
  NO_SUCH_ISSUER: '15',
  FORMAT_ERROR: '30',
  SUSPECT_FRAUD: '34',
  RESTRICTED_CARD: '36',
  PIN_TRIES_EXCEEDED: '38',
  NO_INVESTMENT_ACCOUNT: '39',
  LOST_CARD: '41',
  STOLEN_CARD: '43',
  NOT_SUFFICIENT_FUNDS: '51',
  EXPIRED_CARD: '54',
  INCORRECT_PIN: '55',
  NO_CARD_RECORD: '56',
  EXCEEDS_WITHDRAWAL_LIMIT: '61',
  CARD_BLOCKED: '62',
  SECURITY_VIOLATION: '63',
  ISSUER_UNAVAILABLE: '91',
  SYSTEM_MALFUNCTION: '96',
} as const;

export type IsoResponseCodeValue = (typeof IsoResponseCode)[keyof typeof IsoResponseCode];

export function isApproved(code: string): boolean {
  return code === IsoResponseCode.APPROVED;
}

/** Human-readable description for a response code. Falls back to "Unknown". */
export function describeResponseCode(code: string): string {
  const entry = Object.entries(IsoResponseCode).find(([, value]) => value === code);
  return entry ? entry[0].replace(/_/g, ' ').toLowerCase() : `Unknown (${code})`;
}
