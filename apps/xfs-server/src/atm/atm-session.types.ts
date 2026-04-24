/**
 * ATM transaction state machine. The session moves through these states
 * linearly (with ERROR as a sink state that routes back to IDLE via eject).
 */
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
  startedAt: Date;
  updatedAt: Date;
  endedAt?: Date;
  endReason?: 'COMPLETED' | 'CANCELLED' | 'TIMEOUT' | 'ERROR';
}

export interface AtmStateEvent {
  session: AtmSession;
  previousState: AtmState;
}
