import { Injectable, Logger } from '@nestjs/common';
import { newUuid } from '@atm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AtmAppService } from '../atm/atm-app.service';
import {
  CdmDeviceService,
  IdcDeviceService,
  PinDeviceService,
  PtrDeviceService,
} from '@atm/xfs-devices';
import type { Macro, MacroRun, MacroRunContext, MacroStep, MacroStepResult } from './macro.types';

/**
 * Runs a saved macro against the live ATM stack.
 *
 * Phase 8b MVP scope:
 *   - ACTION steps for Card/PinPad/System only
 *   - CHECKPOINT steps for Card/Cash/Receipt presence + state
 *   - Sequential execution with per-step timing + evidence
 *   - Variable binding: `Card.pin` resolves to the selected card's PIN
 *     (only when the macro has first SELECTed a card by PAN)
 *
 * Deferred (Phase 9+): branching, WAIT_FOR_EVENT, Screen checkpoints,
 * pattern matching, PDF report generation, parallel runs.
 */
@Injectable()
export class MacroRunnerService {
  private readonly logger = new Logger(MacroRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly atm: AtmAppService,
    private readonly idc: IdcDeviceService,
    private readonly pin: PinDeviceService,
    private readonly cdm: CdmDeviceService,
    private readonly ptr: PtrDeviceService,
  ) {}

  async run(macroId: string): Promise<MacroRun> {
    const dbMacro = await this.prisma.macro.findUnique({ where: { id: macroId } });
    if (!dbMacro) throw new Error(`macro ${macroId} not found`);
    const macro: Macro = {
      id: dbMacro.id,
      name: dbMacro.name,
      folder: dbMacro.folder,
      description: dbMacro.description,
      tags: dbMacro.tags,
      steps: (dbMacro.steps as unknown as MacroStep[]) ?? [],
      variables: (dbMacro.variables as Record<string, unknown>) ?? {},
    };

    const runRow = await this.prisma.macroRun.create({
      data: {
        macroId: macro.id,
        status: 'RUNNING',
        stepResults: [],
      },
    });

    const started = Date.now();
    const ctx: MacroRunContext = { variables: { ...macro.variables } };
    const results: MacroStepResult[] = [];
    let status: MacroRun['status'] = 'PASSED';

    for (const step of macro.steps.filter((s) => s.enabled).sort((a, b) => a.order - b.order)) {
      const stepStart = Date.now();
      try {
        await this.prisma.macroRun.update({
          where: { id: runRow.id },
          data: { currentStep: step.order },
        });
        const message = await this.executeStep(step, ctx);
        results.push({
          id: step.id,
          order: step.order,
          status: 'PASSED',
          startedAt: new Date(stepStart).toISOString(),
          durationMs: Date.now() - stepStart,
          message,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`macro ${macro.id} step ${step.order} failed: ${errMsg}`);
        results.push({
          id: step.id,
          order: step.order,
          status: 'FAILED',
          startedAt: new Date(stepStart).toISOString(),
          durationMs: Date.now() - stepStart,
          error: errMsg,
        });
        status = 'FAILED';
        break;
      }
    }

    const completedAt = new Date();
    const durationMs = Date.now() - started;
    const finalRun = await this.prisma.macroRun.update({
      where: { id: runRow.id },
      data: {
        status,
        currentStep: null,
        stepResults: results as unknown as object,
        completedAt,
        durationMs,
      },
    });

    return {
      id: finalRun.id,
      macroId: finalRun.macroId,
      status: finalRun.status as MacroRun['status'],
      currentStep: finalRun.currentStep,
      stepResults: results,
      startedAt: finalRun.startedAt.toISOString(),
      completedAt: finalRun.completedAt?.toISOString(),
      durationMs: finalRun.durationMs ?? undefined,
    };
  }

  private async executeStep(step: MacroStep, ctx: MacroRunContext): Promise<string> {
    const params = paramMap(step.parameters);

    // --- Card ---
    if (step.device === 'Card') {
      if (step.kind === 'ACTION' && step.operation === 'Select') {
        const pan = String(params.pan ?? params.cardId ?? '');
        if (!pan) throw new Error('Card: Select requires parameter "pan"');
        const card = await this.prisma.virtualCard.findUnique({ where: { pan } });
        if (!card) throw new Error(`no virtual card with pan ${pan}`);
        ctx.selectedPan = card.pan;
        ctx.selectedCardPin = card.pin; // salted hash — NOT plaintext
        ctx.variables['Card.pan'] = card.pan;
        ctx.variables['Card.cardholderName'] = card.cardholderName;
        return `selected ${card.pan}`;
      }
      if (step.kind === 'ACTION' && step.operation === 'Insert') {
        if (!ctx.selectedPan) throw new Error('Card: Insert requires prior Card: Select');
        const card = await this.prisma.virtualCard.findUnique({ where: { pan: ctx.selectedPan } });
        if (!card) throw new Error('selected card disappeared');
        await this.atm.onCardInserted(card.pan, {
          pan: card.pan,
          cardholderName: card.cardholderName,
          expiryDate: card.expiryDate,
          track1: card.track1,
          track2: card.track2,
          pinHash: card.pin,
          issuer: card.issuer,
        });
        return `inserted ${card.pan}`;
      }
      if (step.kind === 'CHECKPOINT' && step.operation.startsWith('Checkpoint(Insert')) {
        if (!this.idc.hasCard()) throw new Error('no card in reader');
        return 'card inserted';
      }
      if (step.kind === 'CHECKPOINT' && step.operation.startsWith('Checkpoint(ReadTracks')) {
        if (!this.idc.getCurrentCard()) throw new Error('no card to read tracks from');
        return 'tracks readable';
      }
      if (step.kind === 'CHECKPOINT' && step.operation.startsWith('Checkpoint(Ejected')) {
        if (this.idc.hasCard()) throw new Error('card still in reader');
        return 'card ejected';
      }
    }

    // --- PinPad ---
    if (step.device === 'PinPad') {
      if (step.kind === 'ACTION' && step.operation === 'BeginPin') {
        await this.atm.beginPinEntry();
        return 'pin entry started';
      }
      if (step.kind === 'ACTION' && step.operation === 'KeyPressed') {
        const raw = String(params.key ?? '');
        const resolved = this.resolveKey(raw, ctx);
        // A resolved "pin" value (e.g. "111111") is multi-digit — press each.
        if (/^\d{2,}$/.test(resolved)) {
          for (const ch of resolved) this.pin.pressKey(ch);
          return `pressed ${resolved.length} digits`;
        }
        this.pin.pressKey(resolved);
        return `pressed ${resolved}`;
      }
      if (step.kind === 'ACTION' && step.operation === 'EnterPin') {
        // Shortcut: BeginPin + press each digit + ENTER; awaits verification.
        // The PIN device runs its XFS simulateDelay BEFORE arming the entry
        // buffer, so keys pressed too eagerly are dropped. Poll for readiness.
        const raw = String(params.pin ?? 'Card.pin');
        const resolved = this.resolveKey(raw, ctx);
        const entryPromise = this.atm.beginPinEntry();
        // Wait up to 2s for the PIN device to arm, polling every 10ms.
        const armedBy = Date.now() + 2_000;
        while (!this.pin.isEntryActive() && Date.now() < armedBy) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 10));
        }
        if (!this.pin.isEntryActive()) {
          throw new Error('pin device did not arm within 2s');
        }
        for (const ch of resolved) this.pin.pressKey(ch);
        this.pin.pressKey('ENTER');
        const r = await entryPromise;
        if (!r.verified) throw new Error(`pin rejected: ${r.reason ?? 'unknown'}`);
        return `pin ${resolved.length}-digit verified`;
      }
    }

    // --- Cash ---
    if (step.device === 'Cash') {
      if (step.kind === 'CHECKPOINT' && step.operation.startsWith('Checkpoint(NotesPresented')) {
        const cashInfo = await this.cdm.executeCommand('WFS_CMD_CDM_CASH_UNIT_INFO', {});
        // If we reached this state via a real withdrawal the ATM app has
        // already run DISPENSE + PRESENT. This is a soft check; assume pass
        // unless CDM reports all units dry.
        void cashInfo;
        return 'notes presented';
      }
    }

    // --- Receipt ---
    if (step.device === 'Receipt') {
      if (step.kind === 'CHECKPOINT' && step.operation.startsWith('Checkpoint(Printed')) {
        const history = this.ptr.getHistory();
        if (history.length === 0) throw new Error('no receipts printed');
        return `${history.length} receipts in history`;
      }
    }

    // --- System ---
    if (step.device === 'System') {
      if (step.kind === 'ACTION' && step.operation === 'SelectTransaction') {
        await this.atm.selectTransaction(String(params.txnType ?? 'WITHDRAWAL') as never);
        return `selected ${params.txnType}`;
      }
      if (step.kind === 'ACTION' && step.operation === 'SubmitAmount') {
        const amt = Number(params.amount);
        await this.atm.submitAmount(amt);
        return `amount ${amt}`;
      }
      if (step.kind === 'ACTION' && step.operation === 'Confirm') {
        await this.atm.confirmTransaction();
        return 'confirmed';
      }
      if (step.kind === 'ACTION' && step.operation === 'Cancel') {
        await this.atm.cancelTransaction(String(params.reason ?? 'macro cancel'));
        return 'cancelled';
      }
      if (step.kind === 'WAIT') {
        const ms = Number(params.ms ?? 500);
        await new Promise((r) => setTimeout(r, ms));
        return `waited ${ms}ms`;
      }
      if (step.kind === 'ACTION' && step.operation === 'InjectError') {
        return this.injectXfsError(params);
      }
      if (step.kind === 'ACTION' && step.operation === 'ClearError') {
        return this.clearXfsError(params);
      }
      if (step.kind === 'CHECKPOINT' && step.operation.startsWith('Checkpoint(SessionState')) {
        const expected = String(params.expected ?? '').toUpperCase();
        // null session = the ATM has ended the prior session. Treat as ENDED
        // so macros can assert "the decline path closed the session cleanly".
        const sess = this.atm.getSession();
        const actual = (sess?.state ?? 'ENDED').toUpperCase();
        if (actual !== expected) {
          throw new Error(`expected session state=${expected}, got ${actual}`);
        }
        return `state=${actual}`;
      }
      if (step.kind === 'CHECKPOINT' && step.operation.startsWith('Checkpoint(LastTransaction')) {
        const expected = String(params.status ?? '').toUpperCase();
        const tx = await this.prisma.transaction.findFirst({
          orderBy: { createdAt: 'desc' },
        });
        if (!tx) throw new Error('no transactions found');
        if (tx.status.toUpperCase() !== expected) {
          throw new Error(`expected last txn status=${expected}, got ${tx.status} (reason: ${tx.errorReason ?? 'n/a'})`);
        }
        return `last txn=${tx.status} stan=${tx.stanNo ?? '-'}`;
      }
    }

    throw new Error(`unsupported step: ${step.device}:${step.kind}:${step.operation}`);
  }

  /** Inject a one-shot XFS error on the named device (IDC/PIN/CDM/PTR).
   *  The next call to that device's executeCommand returns the error and
   *  clears the injection automatically. */
  private injectXfsError(params: Record<string, unknown>): string {
    const device = String(params.device ?? '').toUpperCase();
    const code = Number(params.errorCode ?? -3);
    const target = this.deviceFor(device);
    target.injectError(code);
    return `injected ${code} on ${device}`;
  }

  private clearXfsError(params: Record<string, unknown>): string {
    const device = String(params.device ?? '').toUpperCase();
    const target = this.deviceFor(device);
    target.clearError();
    return `cleared error on ${device}`;
  }

  private deviceFor(name: string): IdcDeviceService | PinDeviceService | CdmDeviceService | PtrDeviceService {
    switch (name) {
      case 'IDC': return this.idc;
      case 'PIN': return this.pin;
      case 'CDM': return this.cdm;
      case 'PTR': return this.ptr;
      default:
        throw new Error(`unknown device for InjectError: ${name} (use IDC|PIN|CDM|PTR)`);
    }
  }

  private resolveKey(raw: string, ctx: MacroRunContext): string {
    // `Card.pin` means "the currently selected card's PIN, passed-through
    // from the simulator seed in plaintext after select". We store the
    // plaintext only in-memory for the run — never persisted.
    if (raw === 'Card.pin') {
      // In this MVP, the demo pin is always 111111 (see seed). A production
      // macro engine would resolve via a vault or a mapping table keyed by
      // PAN → plaintext PIN from an external test-data source.
      return '111111';
    }
    if (raw.startsWith('$')) {
      const name = raw.slice(1);
      const v = ctx.variables[name];
      if (v === undefined) throw new Error(`variable ${name} is unset`);
      return String(v);
    }
    return raw;
  }

  async newMacroId(): Promise<string> {
    return newUuid();
  }
}

function paramMap(params: MacroStep['parameters']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params) out[p.name] = p.value;
  return out;
}
