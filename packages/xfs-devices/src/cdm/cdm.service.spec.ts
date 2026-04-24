import { EventEmitter2 } from '@nestjs/event-emitter';
import { CDM_CMD, CDM_EVT, CashUnit, XfsResult } from '@atm/xfs-core';
import { CdmDeviceService } from './cdm.service';

describe('CdmDeviceService', () => {
  let events: EventEmitter2;
  let svc: CdmDeviceService;

  beforeEach(() => {
    events = new EventEmitter2();
    svc = new CdmDeviceService(events);
    svc.setResponseDelay(0);
  });

  it('reports self-service capabilities in IDR', () => {
    const caps = svc.getCapabilities();
    expect(caps.currency).toBe('IDR');
    expect(caps.canPresent).toBe(true);
    expect(caps.canRetract).toBe(true);
  });

  it('DISPENSE greedy mix for Rp 370,000 uses highest denoms first', async () => {
    const res = (await svc.executeCommand(CDM_CMD.DISPENSE, {
      amount: 370_000,
      currency: 'IDR',
      mixType: 'MIN_NOTES',
      present: false,
    })) as { mix: Record<string, number>; totalDispensed: number };

    expect(res.totalDispensed).toBe(370_000);
    // Greedy: 3 × 100k + 1 × 50k + 1 × 20k
    expect(res.mix['100000']).toBe(3);
    expect(res.mix['50000']).toBe(1);
    expect(res.mix['20000']).toBe(1);
  });

  it('DISPENSE rejects amount that cannot be exactly made', async () => {
    await expect(
      svc.executeCommand(CDM_CMD.DISPENSE, {
        amount: 10_001,
        currency: 'IDR',
        mixType: 'MIN_NOTES',
        present: false,
      }),
    ).rejects.toThrow('cannot dispense');
  });

  it('DISPENSE with custom mix validates the sum', async () => {
    const res = (await svc.executeCommand(CDM_CMD.DISPENSE, {
      amount: 300_000,
      currency: 'IDR',
      mixType: 'CUSTOM',
      customMix: { '100000': 2, '50000': 2 },
      present: false,
    })) as { mix: Record<string, number> };
    expect(res.mix['100000']).toBe(2);
    expect(res.mix['50000']).toBe(2);

    await expect(
      svc.executeCommand(CDM_CMD.DISPENSE, {
        amount: 300_000,
        currency: 'IDR',
        mixType: 'CUSTOM',
        customMix: { '100000': 1 },
        present: false,
      }),
    ).rejects.toThrow('custom mix sum');
  });

  it('DISPENSE rejects invalid amount', async () => {
    await expect(
      svc.executeCommand(CDM_CMD.DISPENSE, {
        amount: -1,
        currency: 'IDR',
        mixType: 'MIN_NOTES',
        present: false,
      }),
    ).rejects.toThrow('invalid amount');
  });

  it('DISPENSE throws when all cassettes are empty', async () => {
    for (const u of svc.getUnits()) {
      if (u.unitId !== 'REJECT') svc.replenishCassette(u.unitId, 0);
    }
    await expect(
      svc.executeCommand(CDM_CMD.DISPENSE, {
        amount: 100_000,
        currency: 'IDR',
        mixType: 'MIN_NOTES',
        present: false,
      }),
    ).rejects.toThrow(/cannot dispense|insufficient|no active cassette/);
  });

  it('DISPENSE 100k falls back to 50k+50k if 100k cassette is empty', async () => {
    const hundred = svc.getUnits().find((u) => u.denomination === 100_000)!;
    svc.replenishCassette(hundred.unitId, 0);
    const res = (await svc.executeCommand(CDM_CMD.DISPENSE, {
      amount: 100_000,
      currency: 'IDR',
      mixType: 'MIN_NOTES',
      present: false,
    })) as { mix: Record<string, number> };
    expect(res.mix['50000']).toBe(2);
    expect(res.mix['100000']).toBeUndefined();
  });

  it('low count triggers CASH_UNIT_THRESHOLD event', async () => {
    const loadedUnits: CashUnit[] = [
      {
        unitId: 'CASS1',
        denomination: 100_000,
        currency: 'IDR',
        status: 'OK',
        count: 51,
        initialCount: 51,
        maximum: 2500,
        minimum: 50,
        rejectCount: 0,
      },
      {
        unitId: 'REJECT',
        denomination: 0,
        currency: 'IDR',
        status: 'OK',
        count: 0,
        initialCount: 0,
        maximum: 300,
        minimum: 0,
        rejectCount: 0,
      },
    ];
    svc.loadCassettes(loadedUnits);

    const spy = jest.fn();
    events.on('xfs.event', spy);

    await svc.executeCommand(CDM_CMD.DISPENSE, {
      amount: 200_000,
      currency: 'IDR',
      mixType: 'MIN_NOTES',
      present: false,
    });

    const thresholdEvents = spy.mock.calls.filter(
      (c) => c[0].eventCode === CDM_EVT.CASH_UNIT_THRESHOLD,
    );
    expect(thresholdEvents.length).toBeGreaterThan(0);
  });

  it('PRESENT emits NOTES_PRESENTED after dispense', async () => {
    await svc.executeCommand(CDM_CMD.DISPENSE, {
      amount: 200_000,
      currency: 'IDR',
      mixType: 'MIN_NOTES',
      present: false,
    });

    const spy = jest.fn();
    events.on('xfs.event', spy);
    await svc.executeCommand(CDM_CMD.PRESENT, {});
    const ev = spy.mock.calls.find((c) => c[0].eventCode === CDM_EVT.NOTES_PRESENTED);
    expect(ev).toBeDefined();
  });

  it('PRESENT without prior dispense throws', async () => {
    await expect(svc.executeCommand(CDM_CMD.PRESENT, {})).rejects.toThrow('no cash to present');
  });

  it('RETRACT without presented cash throws', async () => {
    await expect(svc.executeCommand(CDM_CMD.RETRACT, {})).rejects.toThrow('nothing to retract');
  });

  it('RETRACT moves notes to reject cassette', async () => {
    await svc.executeCommand(CDM_CMD.DISPENSE, {
      amount: 100_000,
      currency: 'IDR',
      mixType: 'MIN_NOTES',
      present: false,
    });
    await svc.executeCommand(CDM_CMD.RETRACT, {});
    const reject = svc.getUnits().find((u) => u.unitId === 'REJECT')!;
    expect(reject.count).toBeGreaterThan(0);
  });

  it('COUNT sums non-reject cassettes', async () => {
    const r = (await svc.executeCommand(CDM_CMD.COUNT, {})) as {
      totalAmount: number;
      totalNotes: number;
    };
    expect(r.totalNotes).toBeGreaterThan(0);
    expect(r.totalAmount).toBeGreaterThan(0);
  });

  it('CASH_UNIT_INFO lists all cassettes', async () => {
    const r = (await svc.executeCommand(CDM_CMD.CASH_UNIT_INFO, {})) as { units: CashUnit[] };
    expect(r.units.length).toBeGreaterThanOrEqual(4);
  });

  it('replenishCassette out of range throws', () => {
    expect(() => svc.replenishCassette('CASS1', -1)).toThrow('out of range');
    expect(() => svc.replenishCassette('CASS1', 99_999_999)).toThrow('out of range');
  });

  it('simulateJam sets status and emits JAM event', () => {
    const spy = jest.fn();
    events.on('xfs.event', spy);
    svc.simulateJam('CASS1');
    const jammed = svc.getUnits().find((u) => u.unitId === 'CASS1')!;
    expect(jammed.status).toBe('JAMMED');
    const ev = spy.mock.calls.find((c) => c[0].eventCode === CDM_EVT.JAM);
    expect(ev).toBeDefined();
  });

  it('clearJam returns cassette to OK/LOW/EMPTY based on count', () => {
    svc.simulateJam('CASS1');
    svc.clearJam('CASS1');
    const u = svc.getUnits().find((x) => x.unitId === 'CASS1')!;
    expect(u.status).toBe('OK');
  });

  it('RESET clears injected errors and presented cash', async () => {
    await svc.executeCommand(CDM_CMD.DISPENSE, {
      amount: 100_000,
      currency: 'IDR',
      mixType: 'MIN_NOTES',
      present: false,
    });
    await svc.executeCommand(CDM_CMD.RESET, {});
    // PRESENT should now fail since presentedCash cleared
    await expect(svc.executeCommand(CDM_CMD.PRESENT, {})).rejects.toThrow('no cash');
  });

  it('injected error trips next command', async () => {
    svc.injectError(XfsResult.ERR_HARDWARE_ERROR);
    await expect(
      svc.executeCommand(CDM_CMD.DISPENSE, {
        amount: 100_000,
        currency: 'IDR',
        mixType: 'MIN_NOTES',
        present: false,
      }),
    ).rejects.toThrow('injected');
  });

  it('unsupported command throws', async () => {
    await expect(svc.executeCommand('WFS_CMD_CDM_BOGUS', {})).rejects.toThrow('Unsupported CDM');
  });

  it('START_EXCHANGE and END_EXCHANGE ack ok', async () => {
    await expect(svc.executeCommand(CDM_CMD.START_EXCHANGE, {})).resolves.toEqual({ ok: true });
    await expect(svc.executeCommand(CDM_CMD.END_EXCHANGE, {})).resolves.toEqual({ ok: true });
  });
});
