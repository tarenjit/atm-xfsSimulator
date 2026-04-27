import { EventEmitter2 } from '@nestjs/event-emitter';
import { SIU_CMD, SIU_EVT, XfsResult } from '@atm/xfs-core';
import { SiuDeviceService } from './siu.service';

describe('SiuDeviceService', () => {
  let events: EventEmitter2;
  let svc: SiuDeviceService;

  beforeEach(() => {
    events = new EventEmitter2();
    svc = new SiuDeviceService(events);
    svc.setResponseDelay(0);
  });

  it('reports SIU capabilities with all sensors and indicators', () => {
    const caps = svc.getCapabilities();
    expect(caps.serviceClass).toBe('SIU');
    expect(caps.sensors).toEqual(['CABINET_DOOR', 'SAFE_DOOR', 'TAMPER', 'OPERATOR_SWITCH']);
    expect(caps.indicators).toEqual(['POWER', 'READY', 'FAULT', 'SERVICE']);
    expect(caps.hasOperatorSwitch).toBe(true);
  });

  it('starts with all doors closed and POWER+READY ON', async () => {
    const status = (await svc.executeCommand(SIU_CMD.GET_SENSOR_STATUS, {})) as {
      sensors: Record<string, string>;
      indicators: Record<string, string>;
      operatorMode: string;
    };
    expect(status.sensors.CABINET_DOOR).toBe('CLOSED');
    expect(status.sensors.SAFE_DOOR).toBe('CLOSED');
    expect(status.sensors.TAMPER).toBe('CLOSED');
    expect(status.indicators.POWER).toBe('ON');
    expect(status.indicators.READY).toBe('ON');
    expect(status.indicators.FAULT).toBe('OFF');
    expect(status.operatorMode).toBe('NORMAL');
  });

  it('setSensor emits PORT_STATUS + the sensor-specific event', () => {
    const spy = jest.fn();
    events.on('xfs.event', spy);

    const result = svc.setSensor('CABINET_DOOR', 'OPEN');
    expect(result.changed).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);

    const codes = spy.mock.calls.map((c) => c[0].eventCode);
    expect(codes).toContain(SIU_EVT.PORT_STATUS);
    expect(codes).toContain(SIU_EVT.CABINET_STATUS);
  });

  it('setSensor with same state returns changed=false and emits nothing', () => {
    const spy = jest.fn();
    events.on('xfs.event', spy);

    const result = svc.setSensor('CABINET_DOOR', 'CLOSED'); // already closed
    expect(result.changed).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('OPERATOR_SWITCH OPEN flips operatorMode to SUPERVISOR', () => {
    svc.setSensor('OPERATOR_SWITCH', 'OPEN');
    expect(svc.getOperatorMode()).toBe('SUPERVISOR');

    svc.setSensor('OPERATOR_SWITCH', 'CLOSED');
    expect(svc.getOperatorMode()).toBe('NORMAL');
  });

  it('TAMPER triggers TAMPER_SENSOR USRE event', () => {
    const spy = jest.fn();
    events.on('xfs.event', spy);

    svc.setSensor('TAMPER', 'TAMPERED');
    const tamperEvt = spy.mock.calls
      .map((c) => c[0])
      .find((e) => e.eventCode === SIU_EVT.TAMPER_SENSOR);
    expect(tamperEvt).toBeDefined();
    expect(tamperEvt.eventClass).toBe('USRE');
    expect(tamperEvt.payload.state).toBe('TAMPERED');
  });

  it('DISABLE_EVENTS suppresses subsequent sensor events', async () => {
    await svc.executeCommand(SIU_CMD.DISABLE_EVENTS, {});
    const spy = jest.fn();
    events.on('xfs.event', spy);

    svc.setSensor('CABINET_DOOR', 'OPEN');
    expect(spy).not.toHaveBeenCalled();

    await svc.executeCommand(SIU_CMD.ENABLE_EVENTS, {});
    svc.setSensor('CABINET_DOOR', 'CLOSED');
    expect(spy).toHaveBeenCalled();
  });

  it('SET_INDICATOR updates indicator state', async () => {
    await svc.executeCommand(SIU_CMD.SET_INDICATOR, {
      indicatorId: 'FAULT',
      state: 'BLINKING',
    });
    expect(svc.getIndicator('FAULT')).toBe('BLINKING');

    const status = (await svc.executeCommand(SIU_CMD.GET_SENSOR_STATUS, {})) as {
      indicators: Record<string, string>;
    };
    expect(status.indicators.FAULT).toBe('BLINKING');
  });

  it('SET_INDICATOR with unknown indicator throws', async () => {
    await expect(
      svc.executeCommand(SIU_CMD.SET_INDICATOR, { indicatorId: 'BOGUS', state: 'ON' }),
    ).rejects.toThrow('Unknown indicator');
  });

  it('SET_INDICATOR with invalid state throws', async () => {
    await expect(
      svc.executeCommand(SIU_CMD.SET_INDICATOR, { indicatorId: 'POWER', state: 'PURPLE' }),
    ).rejects.toThrow('Invalid indicator state');
  });

  it('RESET restores default sensors, indicators, and operator mode', async () => {
    svc.setSensor('CABINET_DOOR', 'OPEN');
    svc.setSensor('TAMPER', 'TAMPERED');
    svc.setOperatorMode('MAINTENANCE');
    await svc.executeCommand(SIU_CMD.SET_INDICATOR, {
      indicatorId: 'FAULT',
      state: 'BLINKING',
    });

    await svc.executeCommand(SIU_CMD.RESET, {});

    const status = (await svc.executeCommand(SIU_CMD.GET_SENSOR_STATUS, {})) as {
      sensors: Record<string, string>;
      indicators: Record<string, string>;
      operatorMode: string;
    };
    expect(status.sensors.CABINET_DOOR).toBe('CLOSED');
    expect(status.sensors.TAMPER).toBe('CLOSED');
    expect(status.indicators.FAULT).toBe('OFF');
    expect(status.operatorMode).toBe('NORMAL');
  });

  it('unsupported command throws', async () => {
    await expect(svc.executeCommand('WFS_CMD_SIU_BOGUS', {})).rejects.toThrow(
      'Unsupported SIU command',
    );
  });

  it('injected error is one-shot and clears next call', async () => {
    svc.injectError(XfsResult.ERR_HARDWARE_ERROR);
    await expect(svc.executeCommand(SIU_CMD.GET_SENSOR_STATUS, {})).rejects.toThrow('injected');
    await expect(svc.executeCommand(SIU_CMD.GET_SENSOR_STATUS, {})).resolves.toBeDefined();
  });

  it('RESET runs even when an error is injected', async () => {
    svc.injectError(XfsResult.ERR_HARDWARE_ERROR);
    svc.setSensor('CABINET_DOOR', 'OPEN');
    await expect(svc.executeCommand(SIU_CMD.RESET, {})).resolves.toBeDefined();
  });
});
