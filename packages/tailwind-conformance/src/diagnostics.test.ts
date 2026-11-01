// Every diagnostic the compiler declares has a case in the report.
//
// The full report, which counts this as `noCase`, is too slow for a pull
// request and runs on main. A diagnostic added without a case therefore
// turned the Pages deploy red after merge, with nothing on the pull request
// that added it. Whether a case exists is a lookup, not a compile, so it can
// be asked here; whether the case still fires stays with the report.

import assert from 'node:assert/strict'
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
