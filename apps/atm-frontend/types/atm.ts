export type AtmState =
  | 'IDLE'
  | 'CARD_INSERTED'
  | 'PIN_ENTRY'
  | 'PIN_VERIFIED'
  | 'MAIN_MENU'
  | 'AMOUNT_ENTRY'
  | 'CONFIRM'
  | 'PROCESSING'
  | 'DISPENSING'
  | 'PRINTING'
  | 'EJECTING'
  | 'ERROR'
  | 'ENDED';

export type AtmTxnType = 'WITHDRAWAL' | 'BALANCE' | 'TRANSFER' | 'DEPOSIT';

export interface AtmSession {
  id: string;
  state: AtmState;
  cardPan?: string;
  accountId?: string;
  selectedTxn?: AtmTxnType;
  amount?: number;
  stanNo?: string;
  authCode?: string;
  errorMessage?: string;
  failedPinAttempts: number;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  endReason?: 'COMPLETED' | 'CANCELLED' | 'TIMEOUT' | 'ERROR';
}

export interface VirtualCardSummary {
  pan: string;
  cardholderName: string;
  expiryDate: string;
  status: string;
}

export interface BankTheme {
  id: string;
  code: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  defaultLanguage: string;
  logoUrl?: string | null;
}

export interface FdkOption {
  slot: 'FDK_A' | 'FDK_B' | 'FDK_C' | 'FDK_D' | 'FDK_E' | 'FDK_F' | 'FDK_G' | 'FDK_H';
  label: string;
  value?: number | string; // e.g. amount 300000 or txnType 'BALANCE'
  enabled: boolean;
}
