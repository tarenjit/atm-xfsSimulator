/**
 * EMV Level 2 simulator.
 *
 * Architecture_v3.md §10 Phase 7 mandate: TS EMV L2 simulator package.
 *
 * Scope (sufficient for the simulator's chip-card flows):
 *   1. PSE / DDF select  — vendor middleware looks up payment apps
 *   2. AID select         — chooses VISA/MasterCard/etc. application
 *   3. GET PROCESSING OPTIONS (GPO) — returns AIP + AFL
 *   4. READ RECORD        — returns the cardholder records
 *   5. GENERATE AC        — returns ARQC (we always approve in simulator)
 *   6. CHIP POWER on/off  — returns ATR / disables session
 *
 * What this is NOT:
 *   - Real cryptography. ARQC is a deterministic fake; we don't sign with
 *     the issuer key. The simulator's purpose is to validate ATM software
 *     handling of the EMV protocol, not to produce host-acceptable
 *     cryptograms. Real production uses HSM-derived keys.
 */

export * from './apdu';
export * from './tlv';
export * from './emv-simulator';
