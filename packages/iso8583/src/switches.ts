/**
 * Indonesian banking switch profiles.
 *
 * Per Architecture_v3.md §10 Phase 3: "Host emulator with Indonesian profiles
 * (Jalin, ATM Bersama, Prima, BI-FAST)". Each switch in the Indonesian
 * inter-bank routing landscape has its own message conventions, response code
 * extensions, and operational quirks. The host emulator selects a profile per
 * transaction (by configured default or by issuer BIN) and applies it when
 * shaping responses.
 *
 * The PAN-prefix → switch lookup here is simulator-only routing. In real
 * deployments switch selection is governed by issuer agreement, not BIN, but
 * for the simulator's "Jalin vs Prima vs ATMB vs BI-FAST" demo it gives
 * deterministic routing without needing per-bank policy data.
 */

import { IsoMti, IsoResponseCode } from './index';

export type IsoSwitchId = 'JALIN' | 'ATM_BERSAMA' | 'PRIMA' | 'BIFAST';

export interface IsoSwitchProfile {
  id: IsoSwitchId;
  name: string;                              // human-readable
  /** BIN prefixes this switch typically routes for (simulator-only mapping). */
  binPrefixes: string[];
  /** MTI variant used. Most are ISO 8583:1987; BI-FAST uses 1993-style. */
  mtiVariant: '1987' | '1993' | 'BIFAST';
  /** Default Field 41 (Terminal ID) format/prefix. */
  terminalIdPrefix: string;
  /** Default Field 42 (Card Acceptor ID) — typically the bank-acquirer code. */
  cardAcceptorId: string;
  /** ISO 4217 numeric currency code. Indonesia = 360 (IDR). */
  currencyCode: string;
  /** Network keep-alive interval in seconds (NMM 0800 frequency). */
  echoIntervalSec: number;
  /**
   * Switch-specific extension to ISO Field 39 response codes. Standard codes
   * always apply; this map adds switch-private codes (e.g. JALIN's "X1" for
   * issuer-side timeout vs the standard "91").
   */
  extraResponseCodes: Record<string, string>;
  /** Indonesian Rupiah daily limits enforced by this switch (cents = none, IDR is whole-rupiah). */
  defaultDailyLimitIdr: number;
  /** Maximum single-withdrawal amount allowed by switch policy. */
  maxWithdrawalIdr: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// Profile definitions. Values reflect publicly known characteristics of each
// switch as of 2024-2026; they are tuned for realism in test traces, not for
// production interoperability.
// ---------------------------------------------------------------------------

export const JALIN_PROFILE: IsoSwitchProfile = {
  id: 'JALIN',
  name: 'Jalin',
  binPrefixes: ['4097', '4339', '4567', '5436', '5520'], // Mandiri-anchored BINs
  mtiVariant: '1987',
  terminalIdPrefix: 'JLN',
  cardAcceptorId: 'JALIN ATM IDN',
  currencyCode: '360',
  echoIntervalSec: 60,
  extraResponseCodes: {
    X1: 'Issuer timeout (Jalin private)',
    X2: 'Switch-internal routing failure',
  },
  defaultDailyLimitIdr: 10_000_000,
  maxWithdrawalIdr: 5_000_000,
  notes:
    'Jalin is Mandiri-anchored and routes for the Jalin Pembayaran ' +
    'Indonesia network. Default for Mandiri-issued PANs.',
};

export const ATM_BERSAMA_PROFILE: IsoSwitchProfile = {
  id: 'ATM_BERSAMA',
  name: 'ATM Bersama',
  binPrefixes: ['4577', '4585', '4365'], // BTN/BNI/BRI BINs
  mtiVariant: '1987',
  terminalIdPrefix: 'ATB',
  cardAcceptorId: 'ATM BERSAMA IDN',
  currencyCode: '360',
  echoIntervalSec: 30,
  extraResponseCodes: {
    A1: 'Acquirer timeout (ATMB private)',
    A2: 'Member bank not on network',
  },
  defaultDailyLimitIdr: 10_000_000,
  maxWithdrawalIdr: 3_000_000,
  notes:
    'ATM Bersama is the largest Indonesian ATM network (operated by ARTAJASA), ' +
    'connecting most state-owned and regional banks.',
};

export const PRIMA_PROFILE: IsoSwitchProfile = {
  id: 'PRIMA',
  name: 'Prima',
  binPrefixes: ['4263', '5264'], // BCA-anchored BINs
  mtiVariant: '1987',
  terminalIdPrefix: 'PRM',
  cardAcceptorId: 'PRIMA NETWORK ID',
  currencyCode: '360',
  echoIntervalSec: 45,
  extraResponseCodes: {
    P1: 'Member offline (Prima private)',
    P2: 'Daily settlement window closed',
  },
  defaultDailyLimitIdr: 10_000_000,
  maxWithdrawalIdr: 5_000_000,
  notes:
    'Prima is BCA-anchored, operated by Rintis Sejahtera. Typical daily ' +
    'limit Rp 10jt; per-transaction Rp 5jt.',
};

export const BIFAST_PROFILE: IsoSwitchProfile = {
  id: 'BIFAST',
  name: 'BI-FAST',
  binPrefixes: ['4368', '5263'], // BSI/BSM-anchored BINs (illustrative)
  mtiVariant: 'BIFAST',
  terminalIdPrefix: 'BIF',
  cardAcceptorId: 'BI-FAST ID',
  currencyCode: '360',
  echoIntervalSec: 15,                 // BI-FAST is real-time, frequent heartbeats
  extraResponseCodes: {
    BF01: 'BI-FAST routing rejected by central node',
    BF02: 'Daily transaction count exceeded',
    BF03: 'Beneficiary bank not registered',
  },
  defaultDailyLimitIdr: 250_000_000,   // BI-FAST allows much higher limits
  maxWithdrawalIdr: 250_000_000,
  notes:
    'BI-FAST is Bank Indonesia\'s real-time payment system. Uses 1993-style ' +
    'or ISO 20022-derived messages; transaction-level acknowledgement < 25s. ' +
    'Higher limits than legacy switches.',
};

export const ALL_SWITCH_PROFILES: readonly IsoSwitchProfile[] = [
  JALIN_PROFILE,
  ATM_BERSAMA_PROFILE,
  PRIMA_PROFILE,
  BIFAST_PROFILE,
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers.
// ---------------------------------------------------------------------------

/** Default switch when no PAN-routing rule matches. */
export function getDefaultSwitch(): IsoSwitchProfile {
  return JALIN_PROFILE;
}

/** Resolve a PAN to its switch via the simulator BIN-prefix map. */
export function getSwitchByPan(pan: string): IsoSwitchProfile {
  if (!pan || pan.length < 4) return getDefaultSwitch();
  for (const profile of ALL_SWITCH_PROFILES) {
    if (profile.binPrefixes.some((prefix) => pan.startsWith(prefix))) {
      return profile;
    }
  }
  return getDefaultSwitch();
}

/** Look up a switch by id; throws on unknown id. */
export function getSwitchById(id: IsoSwitchId): IsoSwitchProfile {
  const found = ALL_SWITCH_PROFILES.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown switch id: ${id}`);
  return found;
}

/**
 * Resolve a response code, falling back to the standard ISO 8583 codes when
 * the switch doesn't recognise the input. Returns the human description.
 */
export function describeSwitchResponseCode(
  profile: IsoSwitchProfile,
  code: string,
): string {
  if (profile.extraResponseCodes[code]) {
    return `[${profile.name}] ${profile.extraResponseCodes[code]}`;
  }
  // Fall through to the standard ISO catalog.
  const entry = Object.entries(IsoResponseCode).find(([, v]) => v === code);
  return entry ? entry[0].replace(/_/g, ' ').toLowerCase() : `Unknown (${code})`;
}

/** True if the switch uses ISO 8583:1987 framing. */
export function isLegacyIso(profile: IsoSwitchProfile): boolean {
  return profile.mtiVariant === '1987';
}

// Re-export the canonical MTI for convenience — switch profiles don't change
// the MTI surface, only how messages are routed and which response codes apply.
export { IsoMti };
