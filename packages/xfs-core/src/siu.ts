/** SIU (Sensors & Indicators Unit) command and event contracts.
 *
 * Models the physical sensors and indicators on an ATM cabinet:
 *   - Cabinet door, safe door, tamper detect
 *   - Power / ready / fault / service LEDs
 *   - Supervisor (operator) keyswitch
 *
 * Aligns with CEN/XFS 3.30 SIU subset; only the commands and events that
 * matter for our use cases are exposed here.
 */

// Command + event constants are spec-driven (Architecture_v3.md §4.4).
export {
  SIU_CMD,
  SIU_EVT,
  SIU_EVT_CLASS,
  SIU_HSERVICE_DEFAULT,
  type SiuCommandCode,
  type SiuEventCode,
} from './generated/siu';

/** Logical sensor identifiers (mapped from ATM hardware profile). */
export type SiuSensorId =
  | 'CABINET_DOOR'
  | 'SAFE_DOOR'
  | 'TAMPER'
  | 'OPERATOR_SWITCH';

/** Sensor reading.
 *  CLOSED = door closed / switch off / tamper not triggered
 *  OPEN   = door open / switch on
 *  TAMPERED = tamper sensor triggered (latched until RESET)
 *  UNKNOWN = sensor not wired or unreadable.
 */
export type SiuSensorState = 'CLOSED' | 'OPEN' | 'TAMPERED' | 'UNKNOWN';

export type SiuIndicatorId = 'POWER' | 'READY' | 'FAULT' | 'SERVICE';

export type SiuIndicatorState = 'OFF' | 'ON' | 'BLINKING';

export type SiuOperatorMode = 'NORMAL' | 'SUPERVISOR' | 'MAINTENANCE';

export interface SiuSetIndicatorPayload {
  indicatorId: SiuIndicatorId;
  state: SiuIndicatorState;
}

export interface SiuSensorStatusResult {
  sensors: Record<SiuSensorId, SiuSensorState>;
  indicators: Record<SiuIndicatorId, SiuIndicatorState>;
  operatorMode: SiuOperatorMode;
}

export interface SiuPortStatusEventPayload {
  sensorId: SiuSensorId;
  state: SiuSensorState;
  previousState: SiuSensorState;
}

export interface SiuCapabilities {
  serviceClass: 'SIU';
  version: string;
  sensors: SiuSensorId[];
  indicators: SiuIndicatorId[];
  hasOperatorSwitch: boolean;
}
