/**
 * User-action events the ATM app emits when a human operator drives the
 * session. These are the inputs the MacroRecorderService converts into
 * MacroStep entries.
 *
 * Event name on the bus: 'atm.userAction'.
 *
 * Scope: ACTIONS only — the runner derives CHECKPOINTs from XFS events
 * separately (via 'xfs.event').
 */

export type UserActionKind =
  | 'CARD_INSERT'
  | 'KEY_PRESS' // PIN pad keystroke during entry
  | 'SELECT_TRANSACTION'
  | 'SUBMIT_AMOUNT'
  | 'CONFIRM'
  | 'CANCEL';

export interface UserActionBase {
  kind: UserActionKind;
  sessionId?: string;
  timestamp: string;
}

export interface UserActionCardInsert extends UserActionBase {
  kind: 'CARD_INSERT';
  pan: string;
}

export interface UserActionKeyPress extends UserActionBase {
  kind: 'KEY_PRESS';
  key: string;
}

export interface UserActionSelectTransaction extends UserActionBase {
  kind: 'SELECT_TRANSACTION';
  txnType: 'WITHDRAWAL' | 'BALANCE' | 'TRANSFER' | 'DEPOSIT';
}

export interface UserActionSubmitAmount extends UserActionBase {
  kind: 'SUBMIT_AMOUNT';
  amount: number;
}

export interface UserActionConfirm extends UserActionBase {
  kind: 'CONFIRM';
}

export interface UserActionCancel extends UserActionBase {
  kind: 'CANCEL';
  reason?: string;
}

export type UserAction =
  | UserActionCardInsert
  | UserActionKeyPress
  | UserActionSelectTransaction
  | UserActionSubmitAmount
  | UserActionConfirm
  | UserActionCancel;
