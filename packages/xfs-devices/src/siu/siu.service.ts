import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SIU_CMD,
  SIU_EVT,
  SiuCapabilities,
  SiuIndicatorId,
  SiuIndicatorState,
  SiuOperatorMode,
  SiuSensorId,
  SiuSensorState,
  SiuSensorStatusResult,
  SiuSetIndicatorPayload,
  XfsServiceClass,
} from '@atm/xfs-core';
import { VirtualDeviceBase } from '../base/virtual-device.base';

const ALL_SENSORS: readonly SiuSensorId[] = [
  'CABINET_DOOR',
  'SAFE_DOOR',
  'TAMPER',
  'OPERATOR_SWITCH',
] as const;

const ALL_INDICATORS: readonly SiuIndicatorId[] = [
  'POWER',
  'READY',
  'FAULT',
  'SERVICE',
] as const;

/**
 * SIU (Sensors & Indicators) virtual device.
 *
 * State:
 *   - sensors map: each logical sensor → CLOSED | OPEN | TAMPERED | UNKNOWN
 *   - indicators map: each LED → OFF | ON | BLINKING
 *   - operatorMode: NORMAL | SUPERVISOR | MAINTENANCE
 *   - eventsEnabled: when false, sensor changes don't broadcast XFS events
 *     (matches WFS_CMD_SIU_ENABLE_EVENTS / DISABLE_EVENTS semantics)
 *
 * Operator console drives sensor changes via setSensor() / setOperatorMode();
 * the ATM app receives them as standard XFS events.
 */
@Injectable()
export class SiuDeviceService extends VirtualDeviceBase {
  static readonly HSERVICE = 'SIU30';

  private sensors: Record<SiuSensorId, SiuSensorState>;
  private indicators: Record<SiuIndicatorId, SiuIndicatorState>;
  private operatorMode: SiuOperatorMode = 'NORMAL';
  private eventsEnabled = true;

  constructor(events: EventEmitter2) {
    super(XfsServiceClass.SIU, SiuDeviceService.HSERVICE, events);
    this.sensors = this.defaultSensors();
    this.indicators = this.defaultIndicators();
    this.open();
  }

  getCapabilities(): SiuCapabilities {
    return {
      serviceClass: 'SIU',
      version: '3.30',
      sensors: [...ALL_SENSORS],
      indicators: [...ALL_INDICATORS],
      hasOperatorSwitch: true,
    };
  }

  // ---- Operator-console-driven mutations ----------------------------------

  /**
   * Drive a sensor reading. Emits the matching event when events are enabled
   * and the state actually changed. OPERATOR_SWITCH transitions also flip
   * `operatorMode` (OPEN ⇒ SUPERVISOR, CLOSED ⇒ NORMAL).
   */
  setSensor(sensorId: SiuSensorId, state: SiuSensorState): { changed: boolean } {
    const previousState = this.sensors[sensorId];
    if (previousState === state) return { changed: false };

    this.sensors[sensorId] = state;

    // Operator switch toggles operator mode as a side-effect.
    if (sensorId === 'OPERATOR_SWITCH') {
      this.operatorMode = state === 'OPEN' ? 'SUPERVISOR' : 'NORMAL';
    }

    if (this.eventsEnabled) {
      this.emitEvent(SIU_EVT.PORT_STATUS, 'SRVE', {
        sensorId,
        state,
        previousState,
      });

      const specific = this.specificEventForSensor(sensorId);
      if (specific) {
        this.emitEvent(specific, 'USRE', { sensorId, state, previousState });
      }
    }

    return { changed: true };
  }

  /** Force operator mode directly. Mirrors the supervisor keyswitch. */
  setOperatorMode(mode: SiuOperatorMode): void {
    this.operatorMode = mode;
    if (this.eventsEnabled) {
      this.emitEvent(SIU_EVT.OPERATOR_SWITCH, 'USRE', { mode });
    }
  }

  getOperatorMode(): SiuOperatorMode {
    return this.operatorMode;
  }

  getIndicator(id: SiuIndicatorId): SiuIndicatorState {
    return this.indicators[id];
  }

  // ---- XFS surface --------------------------------------------------------

  async executeCommand(commandCode: string, payload: unknown): Promise<unknown> {
    await this.simulateDelay();

    // RESET always runs — escape hatch from injected errors / stuck state.
    if (commandCode === SIU_CMD.RESET) {
      this.reset();
      this.sensors = this.defaultSensors();
      this.indicators = this.defaultIndicators();
      this.operatorMode = 'NORMAL';
      this.eventsEnabled = true;
      return {};
    }

    const injected = this.checkInjectedError();
    if (injected !== null) {
      throw new Error(`XFS injected error: ${injected}`);
    }

    switch (commandCode) {
      case SIU_CMD.ENABLE_EVENTS:
        this.eventsEnabled = true;
        return {};
      case SIU_CMD.DISABLE_EVENTS:
        this.eventsEnabled = false;
        return {};
      case SIU_CMD.SET_INDICATOR:
        return this.handleSetIndicator(payload as SiuSetIndicatorPayload);
      case SIU_CMD.GET_SENSOR_STATUS:
        return this.handleGetSensorStatus();
      default:
        throw new Error(`Unsupported SIU command: ${commandCode}`);
    }
  }

  // ---- Internals ----------------------------------------------------------

  private handleSetIndicator(payload: SiuSetIndicatorPayload): Record<string, never> {
    if (!payload || !ALL_INDICATORS.includes(payload.indicatorId)) {
      throw new Error(`Unknown indicator: ${payload?.indicatorId}`);
    }
    if (!['OFF', 'ON', 'BLINKING'].includes(payload.state)) {
      throw new Error(`Invalid indicator state: ${payload.state}`);
    }
    this.indicators[payload.indicatorId] = payload.state;
    return {};
  }

  private handleGetSensorStatus(): SiuSensorStatusResult {
    return {
      sensors: { ...this.sensors },
      indicators: { ...this.indicators },
      operatorMode: this.operatorMode,
    };
  }

  private specificEventForSensor(sensorId: SiuSensorId): string | null {
    switch (sensorId) {
      case 'CABINET_DOOR':
        return SIU_EVT.CABINET_STATUS;
      case 'SAFE_DOOR':
        return SIU_EVT.SAFE_DOOR;
      case 'TAMPER':
        return SIU_EVT.TAMPER_SENSOR;
      case 'OPERATOR_SWITCH':
        return SIU_EVT.OPERATOR_SWITCH;
      default:
        return null;
    }
  }

  private defaultSensors(): Record<SiuSensorId, SiuSensorState> {
    return {
      CABINET_DOOR: 'CLOSED',
      SAFE_DOOR: 'CLOSED',
      TAMPER: 'CLOSED',
      OPERATOR_SWITCH: 'CLOSED',
    };
  }

  private defaultIndicators(): Record<SiuIndicatorId, SiuIndicatorState> {
    return {
      POWER: 'ON',
      READY: 'ON',
      FAULT: 'OFF',
      SERVICE: 'OFF',
    };
  }
}
