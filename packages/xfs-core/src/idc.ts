/** IDC (Identification Card / card reader) command and event contracts.
 *
 * Command + event constants are spec-driven (Architecture_v3.md §4.4) — they
 * come from spec/xfs-contract.yaml via the generator. Payload-shape
 * interfaces below are still hand-written; payload codegen lands in Phase 8
 * alongside C++ codegen.
 */

export {
  IDC_CMD,
  IDC_EVT,
  IDC_EVT_CLASS,
  IDC_HSERVICE_DEFAULT,
  type IdcCommandCode,
  type IdcEventCode,
} from './generated/idc';

export type IdcTrackNumber = 1 | 2 | 3;

export interface IdcReadTrackPayload {
  tracks: IdcTrackNumber[];
}

export interface IdcReadTrackResult {
  track1?: string;
  track2?: string;
  track3?: string;
  chipData?: string;
  pan: string;
  cardholderName?: string;
  expiryDate?: string;
}

export interface IdcChipIoPayload {
  apdu: string;
}

export interface IdcChipIoResult {
  apdu: string;
  status: 'success' | 'error';
}

export interface IdcCapabilities {
  serviceClass: 'IDC';
  version: string;
  type: 'MOTOR' | 'SWIPE' | 'DIP' | 'CONTACTLESS';
  readTracks: IdcTrackNumber[];
  writeTracks: IdcTrackNumber[];
  chipProtocols: Array<'T0' | 'T1' | 'EMV'>;
  canEject: boolean;
  canRetain: boolean;
}
