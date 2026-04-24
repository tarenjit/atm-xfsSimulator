/**
 * Macro Test Studio types (Update_features.md §4).
 *
 * A macro is a named, reusable sequence of ATM actions + checkpoints.
 * Steps are typed by device + operation; parameters are bound literal
 * values or references like `Card.pin`.
 */

export type MacroStepKind = 'ACTION' | 'CHECKPOINT' | 'ASSERTION' | 'WAIT';

export type MacroDevice =
  | 'Card'
  | 'PinPad'
  | 'Cash'
  | 'Receipt'
  | 'Screen'
  | 'System';

export interface MacroParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'variable';
  value: string | number | boolean;
  displayLabel?: string;
}

export interface MacroStep {
  id: string;
  order: number;
  kind: MacroStepKind;
  device: MacroDevice;
  operation: string; // e.g. "Insert", "KeyPressed", "Checkpoint(NotesPresented)"
  parameters: MacroParameter[];
  enabled: boolean;
  notes?: string;
  timeoutMs?: number;
}

export interface Macro {
  id: string;
  name: string;
  folder?: string | null;
  description?: string | null;
  tags: string[];
  steps: MacroStep[];
  variables: Record<string, unknown>;
}

export interface MacroStepResult {
  order: number;
  id: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  startedAt: string;
  durationMs: number;
  message?: string;
  error?: string;
}

export interface MacroRun {
  id: string;
  macroId: string;
  status: 'RUNNING' | 'PASSED' | 'FAILED' | 'ABORTED';
  currentStep: number | null;
  stepResults: MacroStepResult[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

/**
 * Runtime context passed to each step handler. Tracks the currently
 * selected virtual card (so Card.pin-style variable binding resolves)
 * and collects evidence.
 */
export interface MacroRunContext {
  selectedPan?: string;
  selectedCardPin?: string;
  variables: Record<string, unknown>;
}
