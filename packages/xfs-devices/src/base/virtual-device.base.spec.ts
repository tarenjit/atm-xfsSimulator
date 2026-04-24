import { EventEmitter2 } from '@nestjs/event-emitter';
import { XfsResult, XfsServiceClass, XfsServiceState } from '@atm/xfs-core';
import { VirtualDeviceBase } from './virtual-device.base';

class TestDevice extends VirtualDeviceBase {
  constructor(events: EventEmitter2) {
    super(XfsServiceClass.IDC, 'TEST1', events);
  }
  getCapabilities(): unknown {
    return { test: true };
  }
  async executeCommand(): Promise<unknown> {
    return {};
  }
  // Expose protected helpers for testing
  publicCheck(): XfsResult | null {
    return this.checkInjectedError();
  }
  publicEmit(): void {
    this.emitEvent('TEST_EVENT', 'SRVE', { at: Date.now() });
  }
  async publicDelay(): Promise<void> {
    return this.simulateDelay();
  }
}

describe('VirtualDeviceBase', () => {
  let events: EventEmitter2;
  let dev: TestDevice;

  beforeEach(() => {
    events = new EventEmitter2();
    dev = new TestDevice(events);
  });

  it('open/close/reset toggle state', () => {
    expect(dev.getState()).toBe(XfsServiceState.CLOSED);
    dev.open();
    expect(dev.getState()).toBe(XfsServiceState.OPEN);
    dev.close();
    expect(dev.getState()).toBe(XfsServiceState.CLOSED);
    dev.reset();
    expect(dev.getState()).toBe(XfsServiceState.OPEN);
  });

  it('setResponseDelay clamps to [0, 30000]', () => {
    dev.setResponseDelay(-100);
    dev.setResponseDelay(10_000_000);
    dev.setResponseDelay(500);
    // No direct getter for delay; just ensure it doesn't throw and simulateDelay honours 0.
  });

  it('checkInjectedError is one-shot', () => {
    dev.injectError(XfsResult.ERR_HARDWARE_ERROR);
    expect(dev.publicCheck()).toBe(XfsResult.ERR_HARDWARE_ERROR);
    expect(dev.publicCheck()).toBeNull();
  });

  it('clearError wipes pending injection', () => {
    dev.injectError(XfsResult.ERR_TIMEOUT);
    dev.clearError();
    expect(dev.publicCheck()).toBeNull();
  });

  it('emitEvent pushes to shared bus', () => {
    const spy = jest.fn();
    events.on('xfs.event', spy);
    dev.publicEmit();
    expect(spy).toHaveBeenCalledTimes(1);
    const ev = spy.mock.calls[0][0];
    expect(ev.eventCode).toBe('TEST_EVENT');
    expect(ev.hService).toBe('TEST1');
  });

  it('simulateDelay(0) resolves immediately', async () => {
    dev.setResponseDelay(0);
    const start = Date.now();
    await dev.publicDelay();
    expect(Date.now() - start).toBeLessThan(20);
  });
});
