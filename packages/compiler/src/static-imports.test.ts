import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectStaticModuleImports } from './index.ts'

test('static ESM imports expose actual value bindings separately from resolver requests', () => {
  const result = inspectStaticModuleImports(
    `// import {Fake} from 'fiction'
import D,{Value as V,type T} from 'kit';import * as NS from 'space';import 'effect';import {} from 'empty';
import type {Q} from 'types';export {Thing} from 'forward';export * from 'all';
export type {T} from 'only-types';const lazy=()=>import('dynamic');export const App=()=> <V/>;`,
    'App.tsx',
  )
  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.requests, ['all', 'effect', 'empty', 'forward', 'kit', 'space'])
  assert.deepEqual(result.bindings, [
    { source: 'kit', imported: 'default', local: 'D' },
    { source: 'kit', imported: 'Value', local: 'V' },
    { source: 'space', imported: '*', local: 'NS' },
  ])
})

test('invalid input has no partial import inventory and diagnostics use UTF-16 offsets', () => {
  const source = `const prefix='🌱';import {Value} from 'kit';export const =`
  const result = inspectStaticModuleImports(source, 'App.tsx')
  assert.deepEqual(result.requests, [])
  assert.deepEqual(result.bindings, [])
  assert.ok(result.diagnostics.length)
  for (const row of result.diagnostics) {
    assert.equal(row.code, 'MODULE_IMPORT_ANALYSIS_FAILED')
    assert.ok(row.spanStart >= 0 && row.spanEnd <= source.length)
  }
  assert.throws(() => inspectStaticModuleImports(' '.repeat(4_194_305), 'App.tsx'), /SOURCE_BUDGET/)
  const tooMany = Array.from({ length: 513 }, (_, index) => `import 'module-${index}';`).join('\n')
  assert.throws(() => inspectStaticModuleImports(tooMany, 'App.tsx'), /REQUEST_BUDGET/)
})
