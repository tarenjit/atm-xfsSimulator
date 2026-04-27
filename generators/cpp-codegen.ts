/**
 * generators/cpp-codegen.ts
 *
 * Stub for Phase 8. Reads spec/xfs-contract.yaml and (eventually) emits
 * native/zegen-xfs-sp/include/generated/{xfs_commands,xfs_events,xfs_payloads}.h.
 *
 * Per Architecture_v3.md §10 Phase 2: "TS side first, C++ side stubbed."
 * Per Architecture_v3.md §16: C++ generated headers land under native/zegen-xfs-sp/.
 *
 * For now this script just verifies that the spec is parseable and prints
 * a summary, so the codegen pipeline contract is in place even though the
 * C++ project doesn't exist yet. The real emitter wires up in Phase 8.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

const REPO_ROOT = resolve(__dirname, '..');
const SPEC_PATH = resolve(REPO_ROOT, 'spec', 'xfs-contract.yaml');
const NATIVE_DIR = resolve(REPO_ROOT, 'native', 'zegen-xfs-sp', 'include', 'generated');

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

function main(): void {
  const raw = readFileSync(SPEC_PATH, 'utf-8');
  const spec = load(raw) as XfsContract;

  const serviceCount = Object.keys(spec.services).length;
  const cmdCount = Object.values(spec.services).reduce(
    (n, s) => n + Object.keys(s.commands).length,
    0,
  );
  const evtCount = Object.values(spec.services).reduce(
    (n, s) => n + Object.keys(s.events).length,
    0,
  );

  // eslint-disable-next-line no-console
  console.log(
    `[cpp-codegen] spec parsed OK — XFS ${spec.version}: ${serviceCount} services, ` +
      `${cmdCount} commands, ${evtCount} events, ` +
      `${Object.keys(spec.resultCodes).length} result codes`,
  );

  if (!existsSync(NATIVE_DIR)) {
    // eslint-disable-next-line no-console
    console.log(
      `[cpp-codegen] STUB MODE: native/zegen-xfs-sp/ does not exist yet (Phase 8 work). ` +
        `When it lands, this script will emit xfs_commands.h, xfs_events.h, ` +
        `xfs_payloads.h to ${NATIVE_DIR}.`,
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[cpp-codegen] TODO Phase 8: emit C++ headers to ${NATIVE_DIR}. ` +
      `For now, no files written.`,
  );
}

main();
