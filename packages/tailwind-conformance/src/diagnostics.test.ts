// Every diagnostic the compiler declares has a case in the report.
//
// The full report, which counts this as `noCase`, is too slow for a pull
// request and runs on main. A diagnostic added without a case therefore
// turned the Pages deploy red after merge, with nothing on the pull request
// that added it. Whether a case exists is a lookup, not a compile, so it can
// be asked here; whether the case still fires stays with the report.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { declaredDiagnosticCodes, diagnosticCodesWithoutCase } from './diagnostics.ts'

test('reads the declared codes from hozo_ir', () => {
  assert.ok(declaredDiagnosticCodes().length > 0)
})

test('every declared diagnostic has a provocation or a reason it has none', () => {
  assert.deepEqual(
    diagnosticCodesWithoutCase(),
    [],
    'add a case to PROVOCATIONS in diagnostics.ts, or a reason to UNREACHABLE',
  )
})

// `hozo explain` reads `@hozo/compiler/diagnostics.json` (RFC 011 §5). It
// is generated from the doc comments on `DiagnosticCode`, the cases above
// and what the compiler says about them; any of the three changing without
// a regeneration fails here, on the pull request that changed it.
test('the shipped diagnostic catalog is current and explains every code', async () => {
  const { buildCatalog, catalogFile } = await import('../../../scripts/diagnostic-catalog.mjs')
  const text = await buildCatalog()
  assert.equal(
    readFileSync(catalogFile, 'utf8'),
    text,
    'packages/compiler/diagnostics.json is stale; run node scripts/diagnostic-catalog.mjs',
  )
  const { codes } = JSON.parse(text) as { codes: Record<string, { summary: string }> }
  assert.deepEqual(Object.keys(codes).sort(), declaredDiagnosticCodes())
  assert.deepEqual(
    Object.entries(codes)
      .filter(([, entry]) => !entry.summary)
      .map(([code]) => code),
    [],
    'give each DiagnosticCode variant in crates/hozo_ir a doc comment saying what it means',
  )
})
