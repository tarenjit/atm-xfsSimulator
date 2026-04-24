import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { XfsEvent } from '@atm/xfs-core';
import { PrismaService } from '../prisma/prisma.service';
import type { UserAction } from '../atm/user-action.types';
import type { MacroStep } from './macro.types';

interface RecordingSession {
  macroId: string;
  steps: MacroStep[];
  counter: number;
  startedAt: Date;
  lastKeyRunStart: number | null; // for digit-run coalescing
  digitBuffer: string; // accumulated digits between control keys
  absorbNextEnter: boolean; // set when a PIN-shape flush happens so the
  // subsequent ENTER keypress is NOT re-emitted (the EnterPin macro step
  // already includes the ENTER press + verify).
}

/**
 * MacroRecorderService — Update_features.md §9.
 *
 * Observes 'atm.userAction' and 'xfs.event' while recording is active
 * and builds a MacroStep[] that replays the same interaction.
 *
 * Scope:
 *   - One recording at a time (ATM is a single-session model anyway).
 *   - Digit keystrokes between control keys are coalesced into one
 *     KeyPressed(digits) step — matches the ATMirage reference where a
 *     full PIN shows as a single step with a variable binding.
 *   - Significant XFS events (MEDIAINSERTED, NOTESPRESENTED, ...) are
 *     auto-inserted as CHECKPOINT steps after the action that caused them.
 *   - CANCEL / ENTER and other control keys terminate the current digit
 *     run and emit as their own KeyPressed step.
 *
 * Persistence: macro.steps is overwritten when stopRecording() is called.
 * Prior steps on the target macro are replaced.
 */
@Injectable()
export class MacroRecorderService {
  private readonly logger = new Logger(MacroRecorderService.name);
  private active: RecordingSession | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async startRecording(macroId: string): Promise<{ macroId: string; startedAt: string }> {
    if (this.active) {
      throw new Error(`already recording into ${this.active.macroId}`);
    }
    const macro = await this.prisma.macro.findUnique({ where: { id: macroId } });
    if (!macro) throw new Error(`macro ${macroId} not found`);
    this.active = {
      macroId,
      steps: [],
      counter: 1,
      startedAt: new Date(),
      lastKeyRunStart: null,
      digitBuffer: '',
      absorbNextEnter: false,
    };
    this.logger.log(`started recording into macro ${macroId}`);
    return { macroId, startedAt: this.active.startedAt.toISOString() };
  }

  async stopRecording(): Promise<{ macroId: string; steps: MacroStep[] } | null> {
    if (!this.active) return null;
    this.flushDigitBuffer();
    const { macroId, steps } = this.active;
    const sorted = [...steps].sort((a, b) => a.order - b.order);
    await this.prisma.macro.update({
      where: { id: macroId },
      data: { steps: sorted as unknown as object },
    });
    this.active = null;
    this.logger.log(`stopped recording; saved ${sorted.length} steps into ${macroId}`);
    return { macroId, steps: sorted };
  }

  status(): { recording: boolean; macroId?: string; stepCount?: number } {
    if (!this.active) return { recording: false };
    return {
      recording: true,
      macroId: this.active.macroId,
      stepCount: this.active.steps.length + (this.active.digitBuffer.length > 0 ? 1 : 0),
    };
  }

  @OnEvent('atm.userAction')
  onUserAction(action: UserAction): void {
    if (!this.active) return;

    switch (action.kind) {
      case 'CARD_INSERT':
        this.flushDigitBuffer();
        this.pushStep({
          kind: 'ACTION',
          device: 'Card',
          operation: 'Select',
          parameters: [
            { name: 'pan', type: 'string', value: action.pan, displayLabel: action.pan },
          ],
        });
        this.pushStep({ kind: 'ACTION', device: 'Card', operation: 'Insert', parameters: [] });
        break;

      case 'KEY_PRESS': {
        if (/^[0-9]$/.test(action.key)) {
          this.active.digitBuffer += action.key;
        } else {
          // Control keys (ENTER/CANCEL/CLEAR/HELP/.) — flush digit buffer
          // first. If the flush emitted an EnterPin step (PIN-shape run),
          // the recorder absorbs the subsequent ENTER because EnterPin
          // already sends ENTER + awaits verification.
          this.flushDigitBuffer();
          if (action.key === 'ENTER' && this.active.absorbNextEnter) {
            this.active.absorbNextEnter = false;
            break;
          }
          this.active.absorbNextEnter = false;
          this.pushStep({
            kind: 'ACTION',
            device: 'PinPad',
            operation: 'KeyPressed',
            parameters: [{ name: 'key', type: 'string', value: action.key }],
          });
        }
        break;
      }

      case 'SELECT_TRANSACTION':
        this.flushDigitBuffer();
        this.pushStep({
          kind: 'ACTION',
          device: 'System',
          operation: 'SelectTransaction',
          parameters: [{ name: 'txnType', type: 'string', value: action.txnType }],
        });
        break;

      case 'SUBMIT_AMOUNT':
        this.flushDigitBuffer();
        this.pushStep({
          kind: 'ACTION',
          device: 'System',
          operation: 'SubmitAmount',
          parameters: [{ name: 'amount', type: 'number', value: action.amount }],
        });
        break;

      case 'CONFIRM':
        this.flushDigitBuffer();
        this.pushStep({
          kind: 'ACTION',
          device: 'System',
          operation: 'Confirm',
          parameters: [],
        });
        break;

      case 'CANCEL':
        this.flushDigitBuffer();
        this.pushStep({
          kind: 'ACTION',
          device: 'System',
          operation: 'Cancel',
          parameters: action.reason
            ? [{ name: 'reason', type: 'string', value: action.reason }]
            : [],
        });
        break;
    }
  }

  @OnEvent('xfs.event')
  onXfsEvent(event: XfsEvent): void {
    if (!this.active) return;
    const checkpoint = EVENT_TO_CHECKPOINT[event.eventCode];
    if (!checkpoint) return;
    this.flushDigitBuffer();
    this.pushStep({
      kind: 'CHECKPOINT',
      device: checkpoint.device,
      operation: checkpoint.operation,
      parameters: [],
    });
  }

  /**
   * Flush the currently-buffered run of digit keypresses into a macro step.
   *
   * A 4–12 digit run is treated as a PIN and emitted as a single
   * `PinPad:EnterPin(Card.pin)` step — this matches the §4.1 reference
   * pattern AND gives the runner a one-shot op that already handles
   * beginPinEntry + press digits + ENTER + verify. The recorder then
   * sets `absorbNextEnter` so the upstream ENTER keypress isn't
   * double-recorded.
   *
   * Any other digit run is emitted as a plain `PinPad:KeyPressed(digits)`
   * step with the digits as a literal string (useful for amount entry
   * when the ATM collects numbers through the PIN pad).
   */
  private flushDigitBuffer(): void {
    if (!this.active || this.active.digitBuffer.length === 0) return;
    const digits = this.active.digitBuffer;
    this.active.digitBuffer = '';
    const isPinShape = digits.length >= 4 && digits.length <= 12;

    if (isPinShape) {
      this.pushStep({
        kind: 'ACTION',
        device: 'PinPad',
        operation: 'EnterPin',
        parameters: [
          {
            name: 'pin',
            type: 'variable',
            value: 'Card.pin',
            displayLabel: `Card.pin (${digits.length} digits)`,
          },
        ],
      });
      this.active.absorbNextEnter = true;
      return;
    }

    this.pushStep({
      kind: 'ACTION',
      device: 'PinPad',
      operation: 'KeyPressed',
      parameters: [{ name: 'key', type: 'string', value: digits }],
    });
  }

  private pushStep(partial: Omit<MacroStep, 'id' | 'order' | 'enabled'>): void {
    if (!this.active) return;
    this.active.steps.push({
      ...partial,
      id: randomUUID(),
      order: this.active.counter++,
      enabled: true,
    });
  }
}

/**
 * Map XFS event codes to checkpoint steps the recorder auto-inserts.
 * Keep this list short — too many checkpoints clutter the recorded
 * macro. Phase 8b.3 can add an opt-in "include all events" flag.
 */
const EVENT_TO_CHECKPOINT: Record<string, { device: MacroStep['device']; operation: string }> = {
  WFS_SRVE_IDC_MEDIAINSERTED: { device: 'Card', operation: 'Checkpoint(Insert)' },
  WFS_SRVE_IDC_MEDIAREMOVED: { device: 'Card', operation: 'Checkpoint(Ejected)' },
  WFS_SRVE_IDC_MEDIARETAINED: { device: 'Card', operation: 'Checkpoint(Retained)' },
  WFS_EXEE_CDM_NOTESPRESENTED: { device: 'Cash', operation: 'Checkpoint(NotesPresented)' },
  WFS_SRVE_CDM_ITEMSTAKEN: { device: 'Cash', operation: 'Checkpoint(Taken)' },
  WFS_SRVE_PTR_MEDIAPRESENTED: { device: 'Receipt', operation: 'Checkpoint(Printed)' },
};
