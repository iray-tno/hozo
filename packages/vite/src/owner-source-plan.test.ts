import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { discoverViteOwnerSourcePlan } from './owner-source-plan.ts'

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
