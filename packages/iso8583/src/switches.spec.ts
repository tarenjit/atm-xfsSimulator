import {
  ALL_SWITCH_PROFILES,
  ATM_BERSAMA_PROFILE,
  BIFAST_PROFILE,
  describeSwitchResponseCode,
  getDefaultSwitch,
  getSwitchById,
  getSwitchByPan,
  isLegacyIso,
  JALIN_PROFILE,
  PRIMA_PROFILE,
} from './switches';

describe('Indonesian switch profiles', () => {
  it('exposes all four canonical switches', () => {
    const ids = ALL_SWITCH_PROFILES.map((p) => p.id);
    expect(ids).toEqual(['JALIN', 'ATM_BERSAMA', 'PRIMA', 'BIFAST']);
  });

  it('default switch is Jalin (most common Indonesian routing)', () => {
    expect(getDefaultSwitch().id).toBe('JALIN');
  });

  it('every switch uses IDR currency code 360', () => {
    for (const p of ALL_SWITCH_PROFILES) {
      expect(p.currencyCode).toBe('360');
    }
  });

  it('every switch declares at least one BIN prefix', () => {
    for (const p of ALL_SWITCH_PROFILES) {
      expect(p.binPrefixes.length).toBeGreaterThan(0);
      for (const prefix of p.binPrefixes) {
        expect(prefix).toMatch(/^\d{3,6}$/);
      }
    }
  });

  it('BI-FAST has the highest withdrawal ceiling (real-time + larger limits)', () => {
    expect(BIFAST_PROFILE.maxWithdrawalIdr).toBeGreaterThan(JALIN_PROFILE.maxWithdrawalIdr);
    expect(BIFAST_PROFILE.maxWithdrawalIdr).toBeGreaterThan(PRIMA_PROFILE.maxWithdrawalIdr);
    expect(BIFAST_PROFILE.maxWithdrawalIdr).toBeGreaterThan(ATM_BERSAMA_PROFILE.maxWithdrawalIdr);
  });

  it('BI-FAST has shortest echo interval (real-time settlement)', () => {
    for (const p of ALL_SWITCH_PROFILES) {
      if (p.id !== 'BIFAST') {
        expect(BIFAST_PROFILE.echoIntervalSec).toBeLessThanOrEqual(p.echoIntervalSec);
      }
    }
  });
});

describe('getSwitchByPan', () => {
  it('routes Mandiri-style BIN to Jalin', () => {
    expect(getSwitchByPan('4097123456787234').id).toBe('JALIN');
    expect(getSwitchByPan('4339000000000000').id).toBe('JALIN');
  });

  it('routes BTN/BNI/BRI BIN to ATM Bersama', () => {
    expect(getSwitchByPan('4577000000000000').id).toBe('ATM_BERSAMA');
    expect(getSwitchByPan('4585000000000000').id).toBe('ATM_BERSAMA');
  });

  it('routes BCA-style BIN to Prima', () => {
    expect(getSwitchByPan('4263000000000000').id).toBe('PRIMA');
  });

  it('routes BSI-style BIN to BI-FAST', () => {
    expect(getSwitchByPan('4368000000000000').id).toBe('BIFAST');
    expect(getSwitchByPan('5263000000000000').id).toBe('BIFAST');
  });

  it('unknown BIN falls back to default (Jalin)', () => {
    expect(getSwitchByPan('9999000000000000').id).toBe('JALIN');
  });

  it('handles too-short or empty PAN gracefully', () => {
    expect(getSwitchByPan('').id).toBe('JALIN');
    expect(getSwitchByPan('12').id).toBe('JALIN');
  });
});

describe('getSwitchById', () => {
  it('looks up each switch by id', () => {
    expect(getSwitchById('JALIN')).toBe(JALIN_PROFILE);
    expect(getSwitchById('ATM_BERSAMA')).toBe(ATM_BERSAMA_PROFILE);
    expect(getSwitchById('PRIMA')).toBe(PRIMA_PROFILE);
    expect(getSwitchById('BIFAST')).toBe(BIFAST_PROFILE);
  });

  it('throws on unknown id', () => {
    // @ts-expect-error — verifying the runtime guard.
    expect(() => getSwitchById('NOT_A_SWITCH')).toThrow('Unknown switch id');
  });
});

describe('describeSwitchResponseCode', () => {
  it('returns switch-specific description for private codes', () => {
    expect(describeSwitchResponseCode(JALIN_PROFILE, 'X1')).toContain('Issuer timeout');
    expect(describeSwitchResponseCode(BIFAST_PROFILE, 'BF02')).toContain('Daily transaction count');
  });

  it('falls back to standard ISO catalog for unknown private codes', () => {
    expect(describeSwitchResponseCode(JALIN_PROFILE, '00').toLowerCase()).toContain('approved');
    expect(describeSwitchResponseCode(PRIMA_PROFILE, '51').toLowerCase()).toContain('not sufficient funds');
  });

  it('returns Unknown for codes outside both catalogs', () => {
    expect(describeSwitchResponseCode(JALIN_PROFILE, 'ZZ')).toContain('Unknown');
  });
});

describe('isLegacyIso', () => {
  it('returns true for ISO 8583:1987 switches', () => {
    expect(isLegacyIso(JALIN_PROFILE)).toBe(true);
    expect(isLegacyIso(ATM_BERSAMA_PROFILE)).toBe(true);
    expect(isLegacyIso(PRIMA_PROFILE)).toBe(true);
  });

  it('returns false for BI-FAST (1993-style)', () => {
    expect(isLegacyIso(BIFAST_PROFILE)).toBe(false);
  });
});
