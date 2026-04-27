/**
 * generators/cpp-codegen.ts
 *
 * Reads spec/xfs-contract.yaml and emits C++ headers under
 * native/zegen-xfs-sp/ZegenXFS_SP/include/generated/. The C++ Service
 * Provider (Phases 8b-14) compiles against these — they are the C++ side
 * of the spec-driven sync mechanism per Architecture_v3.md §4.4.
 *
 * Four headers are emitted:
 *   xfs_commands.h     — `WFS_CMD_*` constants per service.
 *   xfs_events.h       — `WFS_*EVE_*` constants + EventClass enum.
 *   xfs_payloads.h     — payload struct skeletons (member fields land Phase 9+).
 *   xfs_result_codes.h — XFS result codes mirroring TS XfsResult.
 *
 * Run: pnpm codegen
 * CI:  pnpm codegen:check  (regenerates and fails on git diff)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

const REPO_ROOT = resolve(__dirname, '..');
const SPEC_PATH = resolve(REPO_ROOT, 'spec', 'xfs-contract.yaml');
const NATIVE_DIR = resolve(
  REPO_ROOT,
  'native',
  'zegen-xfs-sp',
  'ZegenXFS_SP',
  'include',
  'generated',
);

interface ServiceDef {
  description: string;
  hServiceDefault: string;
  commands: Record<string, string>;
  events: Record<string, { code: string; class: string }>;
}

interface XfsContract {
  version: string;
  services: Record<string, ServiceDef>;
  resultCodes: Record<string, number>;
}

const PREAMBLE = `// =============================================================================
// GENERATED FILE — DO NOT EDIT.
// Source: spec/xfs-contract.yaml
// Regenerate via: pnpm codegen
// CI fails if this file is out of date with the spec.
//
// Per Architecture_v3.md §4.4 — single source of truth for TS + C++ contracts.
// =============================================================================`;

function loadSpec(): XfsContract {
  const raw = readFileSync(SPEC_PATH, 'utf-8');
  return load(raw) as XfsContract;
}

function writeHeader(filename: string, body: string): void {
  mkdirSync(NATIVE_DIR, { recursive: true });
  writeFileSync(resolve(NATIVE_DIR, filename), body.replace(/\r\n/g, '\n'), 'utf-8');
}

function pascal(snake: string): string {
  return snake
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

// ---------------------------------------------------------------------------
// xfs_commands.h
// ---------------------------------------------------------------------------

function emitCommands(spec: XfsContract): string {
  const lines = [
    PREAMBLE,
    '',
    '#pragma once',
    '',
    '#include <string_view>',
    '',
    'namespace zegen::xfs::commands {',
    '',
  ];
  for (const [serviceId, svc] of Object.entries(spec.services)) {
    lines.push(`// ${serviceId} — ${svc.description}`);
    lines.push(`namespace ${serviceId.toLowerCase()} {`);
    for (const [name, code] of Object.entries(svc.commands)) {
      lines.push(`constexpr std::string_view ${name} = "${code}";`);
    }
    lines.push(`}  // namespace ${serviceId.toLowerCase()}`);
    lines.push('');
  }
  lines.push('}  // namespace zegen::xfs::commands');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// xfs_events.h
// ---------------------------------------------------------------------------

function eventClassEnum(cls: string): string {
  switch (cls) {
    case 'SRVE': return 'ServiceEvent';
    case 'USRE': return 'UserEvent';
    case 'EXEE': return 'ExecuteEvent';
    case 'SYSE': return 'SystemEvent';
    default: throw new Error(`Unknown event class: ${cls}`);
  }
}

function emitEvents(spec: XfsContract): string {
  const lines = [
    PREAMBLE,
    '',
    '#pragma once',
    '',
    '#include <string_view>',
    '',
    'namespace zegen::xfs::events {',
    '',
    '/// XFS event class identifier (per CEN/XFS 3.30 §A.4).',
    'enum class EventClass {',
    '  ServiceEvent,  // SRVE',
    '  UserEvent,     // USRE',
    '  ExecuteEvent,  // EXEE',
    '  SystemEvent,   // SYSE',
    '};',
    '',
  ];
  for (const [serviceId, svc] of Object.entries(spec.services)) {
    lines.push(`// ${serviceId} — ${svc.description}`);
    lines.push(`namespace ${serviceId.toLowerCase()} {`);
    for (const [name, evt] of Object.entries(svc.events)) {
      lines.push(`constexpr std::string_view ${name} = "${evt.code}";`);
      lines.push(`constexpr EventClass ${name}_CLASS = EventClass::${eventClassEnum(evt.class)};`);
    }
    lines.push(`}  // namespace ${serviceId.toLowerCase()}`);
    lines.push('');
  }
  lines.push('}  // namespace zegen::xfs::events');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// xfs_payloads.h — empty struct skeletons for Phase 8a; Phase 9 fills in
// member fields per service.
// ---------------------------------------------------------------------------

function emitPayloads(spec: XfsContract): string {
  const lines = [
    PREAMBLE,
    '',
    '#pragma once',
    '',
    '#include <cstdint>',
    '#include <string>',
    '#include <vector>',
    '',
    'namespace zegen::xfs::payloads {',
    '',
    '// Phase 8a: skeleton structs only. Phase 9-11 populate member fields',
    '// per docs/Architecture_v3.md §10 + spec/xfs-contract.yaml extensions.',
    '',
  ];
  for (const [serviceId, svc] of Object.entries(spec.services)) {
    lines.push(`// ${serviceId} — ${svc.description}`);
    lines.push(`namespace ${serviceId.toLowerCase()} {`);
    for (const name of Object.keys(svc.commands)) {
      lines.push(`struct ${pascal(name)}Payload {};`);
      lines.push(`struct ${pascal(name)}Result {};`);
    }
    for (const name of Object.keys(svc.events)) {
      lines.push(`struct ${pascal(name)}EventPayload {};`);
    }
    lines.push(`}  // namespace ${serviceId.toLowerCase()}`);
    lines.push('');
  }
  lines.push('}  // namespace zegen::xfs::payloads');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// xfs_result_codes.h
// ---------------------------------------------------------------------------

function emitResultCodes(spec: XfsContract): string {
  const lines = [
    PREAMBLE,
    '',
    '#pragma once',
    '',
    '#include <cstdint>',
    '',
    'namespace zegen::xfs::result_codes {',
    '',
    '/// XFS Service Provider return codes. Negative = error.',
  ];
  for (const [name, value] of Object.entries(spec.resultCodes)) {
    lines.push(`constexpr std::int32_t ${name} = ${value};`);
  }
  lines.push('');
  lines.push('}  // namespace zegen::xfs::result_codes');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function main(): void {
  const spec = loadSpec();

  const cmdCount = Object.values(spec.services).reduce(
    (n, s) => n + Object.keys(s.commands).length,
    0,
  );
  const evtCount = Object.values(spec.services).reduce(
    (n, s) => n + Object.keys(s.events).length,
    0,
  );

  if (!existsSync(NATIVE_DIR)) {
    mkdirSync(NATIVE_DIR, { recursive: true });
  }

  writeHeader('xfs_commands.h', emitCommands(spec));
  writeHeader('xfs_events.h', emitEvents(spec));
  writeHeader('xfs_payloads.h', emitPayloads(spec));
  writeHeader('xfs_result_codes.h', emitResultCodes(spec));

  // eslint-disable-next-line no-console
  console.log(
    `[cpp-codegen] wrote 4 headers to native/zegen-xfs-sp/ZegenXFS_SP/include/generated/ ` +
      `(XFS ${spec.version}: ${Object.keys(spec.services).length} services, ${cmdCount} commands, ${evtCount} events)`,
  );
}

main();
