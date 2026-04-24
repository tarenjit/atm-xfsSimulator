import { EventEmitter2 } from '@nestjs/event-emitter';
import { IDC_CMD, IDC_EVT, XfsResult } from '@atm/xfs-core';
import { IdcDeviceService, VirtualCard } from './idc.service';

const sampleCard: VirtualCard = {
  pan: '4580123456787234',
  cardholderName: 'BAJWA/TESTING',
  expiryDate: '2812',
  track1: '%B4580123456787234^BAJWA/TESTING^2812101100000000000000?',
  track2: ';4580123456787234=28121011000000000?',
  pinHash: 'sha256$deadbeef$cafe',
  issuer: 'ZEGEN',
};

describe('IdcDeviceService', () => {
  let events: EventEmitter2;
  let svc: IdcDeviceService;

  beforeEach(() => {
    events = new EventEmitter2();
    svc = new IdcDeviceService(events);
    svc.setResponseDelay(0);
  });

  it('reports MOTOR capabilities with track 1+2', () => {
    const caps = svc.getCapabilities();
    expect(caps.type).toBe('MOTOR');
    expect(caps.readTracks).toEqual([1, 2]);
    expect(caps.canEject).toBe(true);
    expect(caps.canRetain).toBe(true);
  });

  it('emits MEDIA_INSERTED on insertCard and rejects double-insert', () => {
    const spy = jest.fn();
    events.on('xfs.event', spy);

    expect(svc.insertCard(sampleCard)).toEqual({ inserted: true });
    expect(svc.hasCard()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const evt = spy.mock.calls[0][0];
    expect(evt.eventCode).toBe(IDC_EVT.MEDIA_INSERTED);

    expect(svc.insertCard(sampleCard)).toEqual({
      inserted: false,
      reason: 'card already in reader',
    });
  });

  it('READ_TRACK returns pan + tracks + cardholder', async () => {
    svc.insertCard(sampleCard);
    const result = (await svc.executeCommand(IDC_CMD.READ_TRACK, {})) as {
      pan: string;
      track1: string;
    };
    expect(result.pan).toBe(sampleCard.pan);
    expect(result.track1).toBe(sampleCard.track1);
  });

  it('READ_TRACK with no card throws', async () => {
    await expect(svc.executeCommand(IDC_CMD.READ_TRACK, {})).rejects.toThrow('No card in reader');
  });

  it('READ_RAW_DATA returns base64 tracks', async () => {
    svc.insertCard(sampleCard);
    const r = (await svc.executeCommand(IDC_CMD.READ_RAW_DATA, {})) as {
      track1Raw: string;
      track2Raw: string;
    };
    expect(Buffer.from(r.track1Raw, 'base64').toString()).toBe(sampleCard.track1);
    expect(Buffer.from(r.track2Raw, 'base64').toString()).toBe(sampleCard.track2);
  });

  it('EJECT_CARD clears state and emits MEDIA_REMOVED', async () => {
    svc.insertCard(sampleCard);
    const spy = jest.fn();
    events.on('xfs.event', spy);

    await svc.executeCommand(IDC_CMD.EJECT_CARD, {});
    expect(svc.hasCard()).toBe(false);
    const ev = spy.mock.calls.find((c) => c[0].eventCode === IDC_EVT.MEDIA_REMOVED);
    expect(ev).toBeDefined();
  });

  it('EJECT_CARD with no card throws', async () => {
    await expect(svc.executeCommand(IDC_CMD.EJECT_CARD, {})).rejects.toThrow('No card to eject');
  });

  it('RETAIN_CARD emits MEDIA_RETAINED and clears state', async () => {
    svc.insertCard(sampleCard);
    const spy = jest.fn();
    events.on('xfs.event', spy);

    await svc.executeCommand(IDC_CMD.RETAIN_CARD, {});
    expect(svc.hasCard()).toBe(false);
    const ev = spy.mock.calls.find((c) => c[0].eventCode === IDC_EVT.MEDIA_RETAINED);
    expect(ev).toBeDefined();
  });

  it('RESET clears card and errors', async () => {
    svc.insertCard(sampleCard);
    svc.injectError(XfsResult.ERR_HARDWARE_ERROR);
    await svc.executeCommand(IDC_CMD.RESET, {});
    expect(svc.hasCard()).toBe(false);
  });

  it('CHIP_IO stub returns 9000', async () => {
    const r = (await svc.executeCommand(IDC_CMD.CHIP_IO, { apdu: '00A4040007A0000000031010' })) as {
      apdu: string;
      status: string;
    };
    expect(r.apdu).toBe('9000');
    expect(r.status).toBe('success');
  });

  it('unsupported command throws', async () => {
    await expect(svc.executeCommand('WFS_CMD_IDC_BOGUS', {})).rejects.toThrow(
      'Unsupported IDC command',
    );
  });

  it('injected error is one-shot', async () => {
    svc.insertCard(sampleCard);
    svc.injectError(XfsResult.ERR_HARDWARE_ERROR);
    await expect(svc.executeCommand(IDC_CMD.READ_TRACK, {})).rejects.toThrow('injected');

    // Next call succeeds because injection is one-shot.
    await expect(svc.executeCommand(IDC_CMD.READ_TRACK, {})).resolves.toBeDefined();
  });

  it('getCurrentCard and getCurrentPinHash return null when empty', () => {
    expect(svc.getCurrentCard()).toBeNull();
    expect(svc.getCurrentPinHash()).toBeNull();
    svc.insertCard(sampleCard);
    expect(svc.getCurrentPinHash()).toBe(sampleCard.pinHash);
  });

  it('clearError removes pending injection', async () => {
    svc.insertCard(sampleCard);
    svc.injectError(XfsResult.ERR_TIMEOUT);
    svc.clearError();
    await expect(svc.executeCommand(IDC_CMD.READ_TRACK, {})).resolves.toBeDefined();
  });
});
