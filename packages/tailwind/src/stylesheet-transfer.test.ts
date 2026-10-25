import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { loadProjectTailwindSnapshot } from './project-snapshot.ts'
import { ExecutableStylesheetError } from './static-css.ts'
import { restoreTailwindStylesheet } from './theme.ts'

test('a worker restores the same theme and rules without resolving or reading project CSS', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-css-transfer-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'global.css'), '@import "tailwindcss"; @import "./tokens.css";')
  writeFileSync(path.join(root, 'tokens.css'), '@theme { --color-brand: #123456; --spacing: 7px; }')
  const captured = await loadProjectTailwindSnapshot(root)
  const serialized = captured.serialize()
  const names = ['p-2', 'text-brand', 'min-[40rem]:p-2', 'data-[x=b]:p-4']
  const order = (await captured.prepareOrder(names)).snapshot
  const source = `import {View} from '@hozo/core'; export const A=()=> <View className="p-2 text-brand"/>`
  const native = createCompiler(captured.theme).compileNativeModule(source)
  const web = createCompiler(captured.theme).compile(source)

  // Both mutation and deletion are adversarial controls, not a warm cache:
  // restoration has never seen this graph and receives only the string.
  writeFileSync(path.join(root, 'tokens.css'), '@plugin "./must-not-run.cjs";')
  const worker = await restoreTailwindStylesheet(serialized)
  rmSync(path.join(root, 'global.css'))
  rmSync(path.join(root, 'tokens.css'))
  assert.deepEqual(worker.theme, captured.theme)
  assert.deepEqual(worker.stylesheets, captured.stylesheets)
  assert.equal(worker.serialize(), serialized)
  assert.deepEqual((await worker.prepareOrder(names)).snapshot, order)
  assert.deepEqual(createCompiler(worker.theme).compileNativeModule(source), native)
  assert.deepEqual(createCompiler(worker.theme).compile(source), web)
  assert.ok(Object.isFrozen(worker.theme.colors[0]))

  // Preparing a larger universe first must not mutate the next namespace.
  await worker.prepareOrder([...names, 'min-[20rem]:p-2', 'data-[x=a]:p-2'])
  assert.deepEqual((await worker.prepareOrder(names)).snapshot, order)
  assert.deepEqual(
    (await (await restoreTailwindStylesheet(serialized)).prepareOrder(names)).snapshot,
    order,
  )
})

test('restoration refuses incompatible, corrupt or executable transfers instead of falling back', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-css-invalid-transfer-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'global.css'), '@import "./tokens.css";')
  writeFileSync(path.join(root, 'tokens.css'), '@theme { --spacing: 5px; }')
  const serialized = (await loadProjectTailwindSnapshot(root)).serialize()
  const data = JSON.parse(serialized)
  for (const value of [null, {}, { ...data, schema: 2 }, { ...data, tailwindVersion: '0.0.0' }]) {
    await assert.rejects(restoreTailwindStylesheet(JSON.stringify(value)), /incompatible/)
  }
  await assert.rejects(restoreTailwindStylesheet('{'), SyntaxError)
  await assert.rejects(
    restoreTailwindStylesheet(
      JSON.stringify({ ...data, contents: [...data.contents, data.contents[0]] }),
    ),
    /Invalid.*entries/,
  )
  await assert.rejects(
    restoreTailwindStylesheet(JSON.stringify({ ...data, contents: [] })),
    /entry is missing/,
  )
  await assert.rejects(
    restoreTailwindStylesheet(JSON.stringify({ ...data, imports: [] })),
    /not captured/,
  )
  await assert.rejects(
    restoreTailwindStylesheet(JSON.stringify({ ...data, contents: data.contents.slice(0, 1) })),
    /import is missing/,
  )
  const unsafe = JSON.parse(serialized)
  unsafe.contents[1][1] = '@config "./must-not-run.cjs";'
  await assert.rejects(restoreTailwindStylesheet(JSON.stringify(unsafe)), ExecutableStylesheetError)
})

test('restored order honors cancellation and default-project synthetic entries', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-css-default-transfer-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const defaults = await loadProjectTailwindSnapshot(root)
  assert.equal(defaults.entry, null)
  const worker = await restoreTailwindStylesheet(defaults.serialize())
  assert.deepEqual(worker.theme, defaults.theme)
  assert.deepEqual(
    (await worker.prepareOrder(['p-2'])).snapshot,
    (await defaults.prepareOrder(['p-2'])).snapshot,
  )
  const controller = new AbortController()
  controller.abort(new Error('retired Metro config'))
  await assert.rejects(worker.prepareOrder(['p-2'], controller.signal), /retired Metro config/)
  const pending = worker.prepareOrder(['p-4'], new AbortController().signal)
  assert.ok((await pending).snapshot)
})
