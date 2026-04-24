/** IDC (Identification Card / card reader) command and event contracts. */

export const IDC_CMD = {
  READ_RAW_DATA: 'WFS_CMD_IDC_READ_RAW_DATA',
  READ_TRACK: 'WFS_CMD_IDC_READ_TRACK',
  WRITE_TRACK: 'WFS_CMD_IDC_WRITE_TRACK',
  EJECT_CARD: 'WFS_CMD_IDC_EJECT_CARD',
  RETAIN_CARD: 'WFS_CMD_IDC_RETAIN_CARD',
  RESET_COUNT: 'WFS_CMD_IDC_RESET_COUNT',
  RESET: 'WFS_CMD_IDC_RESET',
  CHIP_IO: 'WFS_CMD_IDC_CHIP_IO',
  CHIP_POWER: 'WFS_CMD_IDC_CHIP_POWER',
} as const;

export type IdcCommandCode = (typeof IDC_CMD)[keyof typeof IDC_CMD];

export const IDC_EVT = {
  MEDIA_INSERTED: 'WFS_SRVE_IDC_MEDIAINSERTED',
  MEDIA_REMOVED: 'WFS_SRVE_IDC_MEDIAREMOVED',
  MEDIA_RETAINED: 'WFS_SRVE_IDC_MEDIARETAINED',
  INVALID_TRACK_DATA: 'WFS_EXEE_IDC_INVALIDTRACKDATA',
  INVALID_MEDIA: 'WFS_EXEE_IDC_INVALIDMEDIA',
} as const;

export type IdcEventCode = (typeof IDC_EVT)[keyof typeof IDC_EVT];

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
