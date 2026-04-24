import { EventEmitter2 } from '@nestjs/event-emitter';
import { PTR_CMD, PTR_EVT, XfsResult } from '@atm/xfs-core';
import { PtrDeviceService } from './ptr.service';

describe('PtrDeviceService', () => {
  let events: EventEmitter2;
  let svc: PtrDeviceService;

  beforeEach(() => {
    events = new EventEmitter2();
    svc = new PtrDeviceService(events);
    svc.setResponseDelay(0);
  });

  it('reports thermal capabilities', () => {
    const caps = svc.getCapabilities();
    expect(caps.type).toBe('THERMAL');
    expect(caps.canCut).toBe(true);
    expect(caps.paperCapacity).toBeGreaterThan(0);
  });

  it('PRINT_FORM with RECEIPT returns a receipt id', async () => {
    const r = (await svc.executeCommand(PTR_CMD.PRINT_FORM, {
      formName: 'RECEIPT',
      fields: { amount: '100000', balance: '5000000' },
      mediaType: 'RECEIPT',
      cut: true,
    })) as { receiptId: string };
    expect(r.receiptId).toMatch(/^RCPT/);
    expect(svc.getHistory().length).toBe(1);
  });

  it('PRINT_FORM emits MEDIA_PRESENTED', async () => {
    const spy = jest.fn();
    events.on('xfs.event', spy);
    await svc.executeCommand(PTR_CMD.PRINT_FORM, {
      formName: 'RECEIPT',
      fields: {},
      mediaType: 'RECEIPT',
      cut: true,
    });
    const ev = spy.mock.calls.find((c) => c[0].eventCode === PTR_EVT.MEDIA_PRESENTED);
    expect(ev).toBeDefined();
  });

  it('low paper emits PAPER_THRESHOLD', async () => {
    // Drain paper below threshold by monkeying internal counter via repeated prints.
    // Easier: replenish small count and print.
    // Since replenishPaper sets to 1000, we rely on the fact that threshold is 50.
    // Print 960 receipts would be slow; instead set via raw prints and check that
    // threshold event fires at some point.
    const spy = jest.fn();
    events.on('xfs.event', spy);

    // Drop paper level by forcing many prints.
    for (let i = 0; i < 955; i++) {
      // eslint-disable-next-line no-await-in-loop
      await svc.executeCommand(PTR_CMD.RAW_DATA, { data: 'x' });
    }
    // At this point paperLevel should be 45 — below 50.
    await svc.executeCommand(PTR_CMD.PRINT_FORM, {
      formName: 'RECEIPT',
      fields: {},
      mediaType: 'RECEIPT',
      cut: true,
    });
    const ev = spy.mock.calls.find((c) => c[0].eventCode === PTR_EVT.PAPER_THRESHOLD);
    expect(ev).toBeDefined();
  });

  it('out of paper throws', async () => {
    // Drain paper completely.
    for (let i = 0; i < 1_000; i++) {
      // eslint-disable-next-line no-await-in-loop
      await svc.executeCommand(PTR_CMD.RAW_DATA, { data: '.' });
    }
    await expect(
      svc.executeCommand(PTR_CMD.PRINT_FORM, {
        formName: 'RECEIPT',
        fields: {},
        mediaType: 'RECEIPT',
        cut: true,
      }),
    ).rejects.toThrow('out of paper');
  });

  it('replenishPaper resets the counter', async () => {
    for (let i = 0; i < 1_000; i++) {
      // eslint-disable-next-line no-await-in-loop
      await svc.executeCommand(PTR_CMD.RAW_DATA, { data: '.' });
    }
    svc.replenishPaper();
    expect(svc.getPaperLevel()).toBe(1_000);
  });

  it('RAW_DATA records but does not emit MEDIA_PRESENTED', async () => {
    const spy = jest.fn();
    events.on('xfs.event', spy);
    const r = (await svc.executeCommand(PTR_CMD.RAW_DATA, { data: 'raw payload' })) as {
      printed: boolean;
    };
    expect(r.printed).toBe(true);
    const presented = spy.mock.calls.find((c) => c[0].eventCode === PTR_EVT.MEDIA_PRESENTED);
    expect(presented).toBeUndefined();
  });

  it('CUT_PAPER ack ok', async () => {
    await expect(svc.executeCommand(PTR_CMD.CUT_PAPER, {})).resolves.toEqual({});
  });

  it('RESET clears error', async () => {
    svc.injectError(XfsResult.ERR_HARDWARE_ERROR);
    await svc.executeCommand(PTR_CMD.RESET, {});
    // next command should succeed
    await expect(
      svc.executeCommand(PTR_CMD.RAW_DATA, { data: 'hi' }),
    ).resolves.toBeDefined();
  });

  it('unsupported command throws', async () => {
    await expect(svc.executeCommand('WFS_CMD_PTR_BOGUS', {})).rejects.toThrow('Unsupported PTR');
  });

  it('history is capped', async () => {
    for (let i = 0; i < 250; i++) {
      // eslint-disable-next-line no-await-in-loop
      await svc.executeCommand(PTR_CMD.RAW_DATA, { data: String(i) });
    }
    expect(svc.getHistory().length).toBeLessThanOrEqual(200);
  });

  it('STATEMENT form renders JSON', async () => {
    const r = await svc.executeCommand(PTR_CMD.PRINT_FORM, {
      formName: 'STATEMENT',
      fields: { k: 'v' },
      mediaType: 'RECEIPT',
      cut: false,
    });
    expect(r).toBeDefined();
  });

  it('injected error throws', async () => {
    svc.injectError(XfsResult.ERR_TIMEOUT);
    await expect(svc.executeCommand(PTR_CMD.RAW_DATA, { data: 'x' })).rejects.toThrow('injected');
  });
});
