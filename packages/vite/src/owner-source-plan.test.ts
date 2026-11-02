import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ViteOwnerPreflightUnavailable } from './owner-preflight.ts'
import { discoverViteOwnerSourcePlan, guardViteOwnerFallbackRoots } from './owner-source-plan.ts'

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'hozo-owner-source-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, file: path.join(root, 'App.tsx') }
}

test('source observations derive actual static edges and content identity without executing modules', (t) => {
  const { file } = fixture(t)
  writeFileSync(
    file,
    `import {Sheet} from 'kit';import type {T} from 'types';import 'effect';export {X} from 'forward';throw new Error('must not execute');`,
  )
  const plan = discoverViteOwnerSourcePlan([file, file])
  assert.deepEqual(plan.edges, [
    { importer: file, specifier: 'effect' },
    { importer: file, specifier: 'forward' },
    { importer: file, specifier: 'kit' },
  ])
  assert.equal(plan.sources!.length, 1)
  assert.match(plan.sources![0]!.sha256, /^[a-f0-9]{64}$/)
  writeFileSync(file, `import {Sheet} from 'kit';export const App=()=> <Sheet/>`)
  assert.notEqual(discoverViteOwnerSourcePlan([file]).context, plan.context)
})

test('unassessed syntax and oversized input cannot produce a usable partial source plan', (t) => {
  const { root, file } = fixture(t)
  writeFileSync(file, "import {Sheet} from 'kit';export const =")
  assert.throws(() => discoverViteOwnerSourcePlan([file]), /SOURCE_UNASSESSED/)
  assert.throws(
    () =>
      discoverViteOwnerSourcePlan(
        Array.from({ length: 513 }, (_, index) => path.join(root, `${index}.tsx`)),
      ),
    /FILE_BUDGET/,
  )
  const directory = path.join(root, 'not-source')
  mkdirSync(directory)
  assert.throws(() => discoverViteOwnerSourcePlan([directory]), /not-a-file/)
})

test('root budget refusals retain observed roots without pretending unread files were inspected', (t) => {
  const { root, file } = fixture(t)
  let refused: ViteOwnerPreflightUnavailable | undefined
  try {
    discoverViteOwnerSourcePlan(Array.from({ length: 513 }, (_, i) => path.join(root, `${i}.tsx`)))
  } catch (error) {
    assert.ok(error instanceof ViteOwnerPreflightUnavailable)
    refused = error
  }
  assert.ok(refused)
  assert.deepEqual(refused.watchFiles, [])
  refused.validate() // None of the deliberately nonexistent files was read.
  assert.throws(
    () =>
      guardViteOwnerFallbackRoots(
        Array.from({ length: 4097 }, (_, i) => path.join(root, `${i}.tsx`)),
        refused!,
      ),
    /FALLBACK_GUARD_FILE_BUDGET/,
  )
  const other = path.join(root, 'Other.tsx')
  for (const [index, target] of [file, other].entries())
    writeFileSync(
      target,
      Array.from({ length: 257 }, (_, i) => `import 'edge-${index}-${i}';`).join('\n'),
    )
  try {
    discoverViteOwnerSourcePlan([file, other])
  } catch (error) {
    assert.ok(error instanceof ViteOwnerPreflightUnavailable)
    refused = error
  }
  assert.equal(refused.watchFiles.length, 2)
  refused.validate()
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n`)
  assert.throws(() => refused.validate(), /source snapshot changed/)
})
