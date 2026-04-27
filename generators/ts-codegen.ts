/**
 * generators/ts-codegen.ts
 *
 * Reads spec/xfs-contract.yaml and emits TypeScript constants under
 * packages/xfs-core/src/generated/. Each device class gets its own file
 * with command-code and event-code maps. A barrel file re-exports them.
 *
 * Per Architecture_v3.md §4.4: this is the spec-driven sync mechanism that
 * keeps TS and (eventually) C++ contracts in lockstep.
 *
 * Run: pnpm codegen
 * CI:  pnpm codegen:check  (regenerates and fails on git diff)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

// ---------------------------------------------------------------------------
// Spec types — kept narrow so a malformed YAML produces a clear failure.
// ---------------------------------------------------------------------------

type EventClass = 'SRVE' | 'USRE' | 'EXEE' | 'SYSE';

interface EventDef {
  code: string;
  class: EventClass;
}

interface ServiceDef {
  description: string;
  hServiceDefault: string;
  commands: Record<string, string>;
  events: Record<string, EventDef>;
}

interface XfsContract {
  version: string;
  description: string;
  generated: { preamble: string };
  resultCodes: Record<string, number>;
  eventClasses: EventClass[];
  services: Record<string, ServiceDef>;
}

// ---------------------------------------------------------------------------
// IO helpers.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..');
const SPEC_PATH = resolve(REPO_ROOT, 'spec', 'xfs-contract.yaml');
const OUT_DIR = resolve(REPO_ROOT, 'packages', 'xfs-core', 'src', 'generated');

function loadSpec(): XfsContract {
  const raw = readFileSync(SPEC_PATH, 'utf-8');
  const parsed = load(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`spec/xfs-contract.yaml did not parse to an object`);
  }
  return parsed as XfsContract;
}

function writeFile(filename: string, body: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  // Normalise line endings so Windows + *nix produce identical files.
  const normalized = body.replace(/\r\n/g, '\n');
  writeFileSync(resolve(OUT_DIR, filename), normalized, 'utf-8');
}

// ---------------------------------------------------------------------------
// Emitters.
// ---------------------------------------------------------------------------

function emitResultCodes(spec: XfsContract): string {
  const lines = [spec.generated.preamble.trimEnd(), ''];
  lines.push('/** XFS result codes (negative = error). Generated from spec. */');
  lines.push('export const XFS_RESULT_CODES = {');
  for (const [name, value] of Object.entries(spec.resultCodes)) {
    lines.push(`  ${name}: ${value},`);
  }
  lines.push('} as const;');
  lines.push('');
  lines.push(
    'export type XfsResultCodeName = keyof typeof XFS_RESULT_CODES;',
  );
  lines.push(
    'export type XfsResultCodeValue = (typeof XFS_RESULT_CODES)[XfsResultCodeName];',
  );
  lines.push('');
  return lines.join('\n');
}

function emitEventClasses(spec: XfsContract): string {
  const lines = [spec.generated.preamble.trimEnd(), ''];
  lines.push('/** XFS event class identifiers per CEN/XFS 3.30. */');
  lines.push('export const XFS_EVENT_CLASSES = [');
  for (const cls of spec.eventClasses) {
    lines.push(`  '${cls}',`);
  }
  lines.push('] as const;');
  lines.push('');
  lines.push(
    'export type XfsEventClassName = (typeof XFS_EVENT_CLASSES)[number];',
  );
  lines.push('');
  return lines.join('\n');
}

function emitService(serviceId: string, svc: ServiceDef, preamble: string): string {
  const lines = [preamble.trimEnd(), ''];
  lines.push(`/** ${serviceId} — ${svc.description} */`);
  lines.push('');
  lines.push(`export const ${serviceId}_HSERVICE_DEFAULT = '${svc.hServiceDefault}' as const;`);
  lines.push('');

  // Commands map.
  lines.push(`/** ${serviceId} command codes. */`);
  lines.push(`export const ${serviceId}_CMD = {`);
  for (const [name, code] of Object.entries(svc.commands)) {
    lines.push(`  ${name}: '${code}',`);
  }
  lines.push('} as const;');
  lines.push('');
  lines.push(
    `export type ${pascal(serviceId)}CommandCode = (typeof ${serviceId}_CMD)[keyof typeof ${serviceId}_CMD];`,
  );
  lines.push('');

  // Events map.
  lines.push(`/** ${serviceId} event codes. */`);
  lines.push(`export const ${serviceId}_EVT = {`);
  for (const [name, evt] of Object.entries(svc.events)) {
    lines.push(`  ${name}: '${evt.code}',`);
  }
  lines.push('} as const;');
  lines.push('');
  lines.push(
    `export type ${pascal(serviceId)}EventCode = (typeof ${serviceId}_EVT)[keyof typeof ${serviceId}_EVT];`,
  );
  lines.push('');

  // Event class lookup — handy for the SP runtime + the TS event router.
  lines.push(`/** Maps each ${serviceId} event code to its XFS event class. */`);
  lines.push(`export const ${serviceId}_EVT_CLASS = {`);
  for (const evt of Object.values(svc.events)) {
    lines.push(`  '${evt.code}': '${evt.class}',`);
  }
  lines.push('} as const;');
  lines.push('');

  return lines.join('\n');
}

function emitIndex(serviceIds: string[]): string {
  const lines = ['// GENERATED FILE — DO NOT EDIT.', '// Source: spec/xfs-contract.yaml', ''];
  lines.push("export * from './result-codes';");
  lines.push("export * from './event-classes';");
  for (const id of serviceIds) {
    lines.push(`export * from './${id.toLowerCase()}';`);
  }
  lines.push('');
  return lines.join('\n');
}

function pascal(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function main(): void {
  const spec = loadSpec();

  writeFile('result-codes.ts', emitResultCodes(spec));
  writeFile('event-classes.ts', emitEventClasses(spec));

  const serviceIds = Object.keys(spec.services);
  for (const id of serviceIds) {
    writeFile(`${id.toLowerCase()}.ts`, emitService(id, spec.services[id], spec.generated.preamble));
  }

  writeFile('index.ts', emitIndex(serviceIds));

  // eslint-disable-next-line no-console
  console.log(
    `[ts-codegen] wrote ${serviceIds.length + 3} files to packages/xfs-core/src/generated/`,
  );
}

main();
