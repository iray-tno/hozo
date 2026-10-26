// Shared build-time priorities from the actual compile plan; emitted winners
// stay unchanged until static and generated fallback publication can switch.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createCompiler, prepareTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const names = [
  'p-2',
  'p-2!',
  'focus:p-4',
  'active:p-4',
  'hover:focus:p-4',
  'hover:p-2!',
  'bg-red-500',
  'focus:bg-blue-500',
  'active:bg-red-500',
  'group-hover:p-2',
]

test('assessed priorities distinguish importance/specificity from raw rule emission order', async () => {
  const prepared = await prepareTailwindOrder(css, base, names)
  const context = prepareTailwindContext(JSON.stringify(prepared.snapshot))
  const priorities = context.rulePriorities()
  assert.equal(priorities.fingerprint, prepared.snapshot.fingerprint)
  const entry = (name) =>
    priorities.rules.find((row) => row.candidateId === prepared.lookup(name)!.id)!
  for (const name of names.filter((name) => name !== 'group-hover:p-2')) {
    assert.equal(typeof entry(name).rank, 'number')
    assert.equal(entry(name).reason, undefined)
  }
  assert.ok(entry('focus:p-4').rank! < entry('active:p-4').rank!)
  assert.ok(entry('active:p-4').rank! < entry('hover:focus:p-4').rank!)
  assert.ok(entry('hover:focus:p-4').rank! < entry('p-2!').rank!)
  assert.ok(entry('p-2!').rank! < entry('hover:p-2!').rank!)
  assert.deepEqual(entry('hover:focus:p-4').specificity, [0, 3, 0])
  assert.equal(entry('p-2!').important, true)
  const emitted = context.ruleOrder().rules.map(({ ruleId }) => ruleId)
  assert.ok(
    emitted.indexOf(entry('hover:focus:p-4').ruleId) < emitted.indexOf(entry('active:p-4').ruleId),
  )
  const unknown = entry('group-hover:p-2')
  assert.equal(unknown.rank, undefined)
  assert.equal(unknown.reason, 'unassessed-selector')
  const ownCopy = context.rulePriorities()
  ownCopy.rules[0]!.rank = 999999
  assert.deepEqual(context.rulePriorities(), priorities)
})

test('actual Web/Native root and secondary write plans consume identical fingerprint-bound priorities', async () => {
  const prepared = await prepareTailwindOrder(css, base, names)
  const context = prepareTailwindContext(JSON.stringify(prepared.snapshot))
  const priorities = new Map(context.rulePriorities().rules.map((row) => [row.ruleId, row]))
  const compiler = createCompiler()
  const source = `import {Pressable,Avatar,cx} from '@hozo/core';
    export const A=({ready})=> <Pressable className={cx('p-2 focus:p-4 active:p-4 hover:focus:p-4 p-2!', ready && 'bg-red-500')}>
      <Avatar fallbackClassName="bg-red-500 focus:bg-blue-500 active:bg-red-500"/>
    </Pressable>`
  const beforeWeb = compiler.compile(source)
  const beforeNative = compiler.compileNativeModule(source)
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  compiler.inspectTailwindOrder = () => {
    throw new Error('no extra inspection parse')
  }
  const web = compiler.compile(source, undefined, { tailwindPlan: true })
  const native = compiler.compileNativeModule(source, undefined, undefined, { tailwindPlan: true })
  assert.deepEqual(
    web.map(({ tailwindPlan: _plan, ...rest }) => rest),
    beforeWeb,
  )
  assert.deepEqual(
    { ...native, components: native.components.map(({ tailwindPlan: _plan, ...rest }) => rest) },
    beforeNative,
  )
  assert.deepEqual(
    web.map(({ tailwindPlan }) => tailwindPlan),
    native.components.map(({ tailwindPlan }) => tailwindPlan),
  )
  const sites = web.flatMap(({ tailwindPlan }) => {
    assert.equal(tailwindPlan!.fingerprint, prepared.snapshot.fingerprint)
    return tailwindPlan!.sites
  })
  assert.ok(sites.some(({ classProp }) => classProp === 'fallbackClassName'))
  let writes = 0
  for (const block of sites.flatMap(({ blocks }) => blocks)) {
    for (const write of block.writes) {
      if (write.ruleId === undefined) {
        assert.equal(write.priorityRank, undefined)
        continue
      }
      const priority = priorities.get(write.ruleId)!
      assert.equal(write.priorityRank, priority.rank)
      assert.equal(write.important, priority.important)
      assert.deepEqual(write.specificity, priority.specificity)
      writes++
    }
  }
  assert.ok(writes > 0)
})

test('ambiguous multi-rule ownership and unassessed rules keep priority absent in the actual plan', async () => {
  const prepared = await prepareTailwindOrder(`${css}\n@utility p-2 { padding: 99px; }`, base, [
    'p-2',
    'group-hover:p-2',
  ])
  const compiler = createCompiler()
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  const source = `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="p-2 group-hover:p-2"/>`
  const result = compiler.compile(source, undefined, { tailwindPlan: true })
  const blocks = result.flatMap(({ tailwindPlan }) =>
    tailwindPlan!.sites.flatMap(({ blocks }) => blocks),
  )
  assert.ok(blocks.some(({ candidate }) => candidate === 'p-2'))
  for (const block of blocks)
    for (const write of block.writes) {
      assert.equal(write.priorityRank, undefined)
      assert.equal(write.important, undefined)
      assert.ok(write.reason)
    }
})
