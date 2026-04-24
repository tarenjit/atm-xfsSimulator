import { EventEmitter2 } from '@nestjs/event-emitter';
import { PIN_CMD, PIN_EVT, XfsResult } from '@atm/xfs-core';
import { PinDeviceService } from './pin.service';

const SPEC = {
  minLen: 4,
  maxLen: 6,
  autoEnd: false,
  activeKeys: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'ENTER', 'CANCEL', 'CLEAR'],
  activeFDKs: [],
  terminateKeys: ['ENTER'],
};

describe('PinDeviceService', () => {
  let events: EventEmitter2;
  let svc: PinDeviceService;

  beforeEach(() => {
    events = new EventEmitter2();
    svc = new PinDeviceService(events);
    svc.setResponseDelay(0);
  });

  it('reports EPP capabilities with ISO0 pin block format', () => {
    const caps = svc.getCapabilities();
    expect(caps.type).toBe('EPP');
    expect(caps.pinBlockFormats).toContain('ISO0');
    expect(caps.supportedKeys).toEqual(expect.arrayContaining(['TPK', 'TMK']));
  });

  it('GET_PIN resolves when user enters valid PIN + ENTER', async () => {
    const promise = svc.executeCommand(PIN_CMD.GET_PIN, SPEC) as Promise<{ pinLength: number }>;
    // Let the async kick off before pressing keys
    await Promise.resolve();
    svc.pressKey('1');
    svc.pressKey('2');
    svc.pressKey('3');
    svc.pressKey('4');
    svc.pressKey('ENTER');
    const result = await promise;
    expect(result.pinLength).toBe(4);
    expect(svc.getBufferedLength()).toBe(4);
  });

  it('GET_PIN ignores ENTER when under minLen', async () => {
    const promise = svc.executeCommand(PIN_CMD.GET_PIN, SPEC) as Promise<{ pinLength: number }>;
    await Promise.resolve();
    svc.pressKey('1');
    svc.pressKey('2');
    svc.pressKey('ENTER'); // too short — ignored
    svc.pressKey('3');
    svc.pressKey('4');
    svc.pressKey('ENTER'); // accepted
    const r = await promise;
    expect(r.pinLength).toBe(4);
  });

  it('CLEAR resets buffer but keeps entry active', async () => {
    const promise = svc.executeCommand(PIN_CMD.GET_PIN, SPEC) as Promise<{ pinLength: number }>;
    await Promise.resolve();
    svc.pressKey('9');
    svc.pressKey('9');
    svc.pressKey('CLEAR');
    expect(svc.getBufferedLength()).toBe(0);
    svc.pressKey('1');
    svc.pressKey('2');
    svc.pressKey('3');
    svc.pressKey('4');
    svc.pressKey('ENTER');
    const r = await promise;
    expect(r.pinLength).toBe(4);
  });

  it('CANCEL rejects the promise', async () => {
    const promise = svc.executeCommand(PIN_CMD.GET_PIN, SPEC);
    await Promise.resolve();
    svc.pressKey('1');
    svc.pressKey('CANCEL');
    await expect(promise).rejects.toThrow('user cancelled');
  });

  it('autoEnd=true terminates at maxLen', async () => {
    const spec = { ...SPEC, autoEnd: true, maxLen: 4 };
    const promise = svc.executeCommand(PIN_CMD.GET_PIN, spec) as Promise<{ pinLength: number }>;
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) svc.pressKey(k);
    const r = await promise;
    expect(r.pinLength).toBe(4);
  });

  it('GET_DATA resolves with the entered digits', async () => {
    const promise = svc.executeCommand(PIN_CMD.GET_DATA, {
      ...SPEC,
      maxLen: 8,
    }) as Promise<{ data: string }>;
    await Promise.resolve();
    for (const k of ['5', '0', '0', '0', '0', '0']) svc.pressKey(k);
    svc.pressKey('ENTER');
    const r = await promise;
    expect(r.data).toBe('500000');
  });

  it('emits KEY events for each keypress', async () => {
    const promise = svc.executeCommand(PIN_CMD.GET_PIN, SPEC) as Promise<{ pinLength: number }>;
    await Promise.resolve();
    const spy = jest.fn();
    events.on('xfs.event', spy);
    svc.pressKey('1');
    svc.pressKey('2');
    svc.pressKey('3');
    svc.pressKey('4');
    svc.pressKey('ENTER');
    await promise;
    const keyEvents = spy.mock.calls.filter((c) => c[0].eventCode === PIN_EVT.KEY);
    expect(keyEvents.length).toBe(5);
  });

  it('GET_PINBLOCK throws without a buffered PIN', async () => {
    await expect(
      svc.executeCommand(PIN_CMD.GET_PINBLOCK, {
        keyName: 'TPK',
        format: 'ISO0',
        pan: '4580123456787234',
      }),
    ).rejects.toThrow('No PIN buffered');
  });

  it('GET_PINBLOCK returns hex PIN block and clears buffer', async () => {
    const entry = svc.executeCommand(PIN_CMD.GET_PIN, SPEC);
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) svc.pressKey(k);
    svc.pressKey('ENTER');
    await entry;

    const block = (await svc.executeCommand(PIN_CMD.GET_PINBLOCK, {
      keyName: 'TPK',
      format: 'ISO0',
      pan: '4580123456787234',
    })) as { pinBlock: string; pinBlockFormat: string; keyName: string };

    expect(block.pinBlock).toMatch(/^[0-9A-F]+$/);
    expect(block.pinBlockFormat).toBe('ISO0');
    expect(block.keyName).toBe('TPK');

    // Subsequent call without re-entry fails.
    await expect(
      svc.executeCommand(PIN_CMD.GET_PINBLOCK, {
        keyName: 'TPK',
        format: 'ISO0',
        pan: '4580123456787234',
      }),
    ).rejects.toThrow('No PIN buffered');
  });

  it('GET_PINBLOCK with unknown key throws', async () => {
    const entry = svc.executeCommand(PIN_CMD.GET_PIN, SPEC);
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) svc.pressKey(k);
    svc.pressKey('ENTER');
    await entry;

    await expect(
      svc.executeCommand(PIN_CMD.GET_PINBLOCK, {
        keyName: 'NOPE',
        format: 'ISO0',
        pan: '4580123456787234',
      }),
    ).rejects.toThrow('Key not found');
  });

  it('RESET cancels active entry and clears buffer', async () => {
    const promise = svc.executeCommand(PIN_CMD.GET_PIN, SPEC);
    await Promise.resolve();
    svc.pressKey('1');
    await svc.executeCommand(PIN_CMD.RESET, {});
    await expect(promise).rejects.toThrow('device reset');
    expect(svc.getBufferedLength()).toBe(0);
  });

  it('extractEnteredPin reads and clears buffer', async () => {
    const entry = svc.executeCommand(PIN_CMD.GET_PIN, SPEC);
    await Promise.resolve();
    for (const k of ['1', '2', '3', '4']) svc.pressKey(k);
    svc.pressKey('ENTER');
    await entry;
    expect(svc.extractEnteredPin()).toBe('1234');
    expect(svc.getBufferedLength()).toBe(0);
  });

  it('pressKey with no active entry logs and is a no-op', () => {
    expect(() => svc.pressKey('1')).not.toThrow();
  });

  it('injected error throws on next command', async () => {
    svc.injectError(XfsResult.ERR_HARDWARE_ERROR);
    await expect(svc.executeCommand(PIN_CMD.GET_PIN, SPEC)).rejects.toThrow('injected');
  });

  it('unsupported command throws', async () => {
    await expect(svc.executeCommand('WFS_CMD_PIN_BOGUS', {})).rejects.toThrow('Unsupported PIN');
  });
});
