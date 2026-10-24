import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { generatePortableOrder } from './portable-order.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

test('checked-in Rust descriptors reproduce the canonical extractor without project paths', async () => {
  const { source, snapshot } = await generatePortableOrder()
  assert.equal(
    readFileSync(
      new URL('../../../crates/hozo_ir/src/tailwind_portable.rs', import.meta.url),
      'utf8',
    ),
    source,
  )
  assert.equal(snapshot.candidates.length, 90)
  assert.equal(snapshot.candidates.flatMap((candidate) => candidate.rules).length, 89)
  assert.equal(
    snapshot.candidates.find((candidate) => candidate.candidate === 'notautility')!.status,
    'not-generated',
  )
  assert.ok(!snapshot.candidates.some((candidate) => candidate.candidate === 'p-3'))
  assert.deepEqual(
    snapshot.stylesheets.map((sheet) => sheet.file),
    ['builtin:tailwindcss/theme.css'],
  )
  assert.deepEqual((await generatePortableOrder()).snapshot, snapshot)
})

const strip = (components) => components.map(({ tailwindPlan: _plan, ...output }) => output)

test('real compile evidence maps expanded writes to original rules without changing either backend', async () => {
  const { snapshot } = await generatePortableOrder()
  const compiler = createCompiler()
  const source = `import {View,Text,Pressable,Avatar,cx} from '@hozo/core';
    export const A=({ready})=><Pressable className={cx('p-2 px-4 hover:focus:p-4 bg-red-500 w-1/2 size-4', ready && 'p-4')}>
      <Avatar fallbackClassName="text-blue-500"/>
      <View className="p-3 sm:p-2"/>
      <Text className="text-lg/6">Text</Text>
    </Pressable>`
  const before = { web: compiler.compile(source), native: compiler.compileNative(source) }
  compiler.setTailwindOrder(JSON.stringify(snapshot))
  assert.deepEqual(compiler.compile(source), before.web)
  assert.deepEqual(compiler.compileNative(source), before.native)
  const web = compiler.compile(source, undefined, { tailwindPlan: true })
  const native = compiler.compileNative(source, undefined, { tailwindPlan: true })
  assert.deepEqual(strip(web), before.web)
  assert.deepEqual(strip(native), before.native)
  assert.deepEqual(
    web.map((entry) => entry.tailwindPlan),
    native.map((entry) => entry.tailwindPlan),
  )
  const blocks = web.flatMap((entry) => entry.tailwindPlan!.sites.flatMap((site) => site.blocks))
  const forCandidate = (candidate: string) =>
    blocks.filter((block) => block.candidate === candidate)
  for (const block of blocks) {
    assert.deepEqual(
      block.writes.map((write) => write.index),
      Array.from({ length: block.end - block.start }, (_, index) => block.start + index),
    )
    for (const write of block.writes) {
      assert.equal(write.reason === undefined, write.ruleId !== undefined)
      if (write.ruleId !== undefined) assert.ok(block.ruleIds.includes(write.ruleId))
    }
  }
  for (const [name, property, weight] of [
    ['p-2', 'padding', 1],
    ['px-4', 'padding-inline', 1],
    ['hover:focus:p-4', 'padding', 3],
    ['bg-red-500', 'background-color', 1],
    ['w-1/2', 'width', 1],
    ['text-blue-500', 'color', 1],
  ] as const) {
    const matching = forCandidate(name)
    assert.ok(matching.length > 0, name)
    for (const write of matching.flatMap((block) => block.writes)) {
      assert.equal(write.cssProperty, property, name)
      assert.deepEqual(write.specificity, [0, weight, 0], name)
    }
  }
  assert.deepEqual(
    new Set(
      forCandidate('size-4').flatMap((block) => block.writes.map((write) => write.cssProperty)),
    ),
    new Set(['width', 'height']),
  )
  assert.ok(
    forCandidate('p-4').some(
      (block) => block.guarded && block.writes.every((write) => write.specificity?.[1] === 1),
    ),
    'authored JS guard must not increase CSS specificity',
  )
  for (const [name, reason] of [
    ['p-3', 'uncollected'],
    ['sm:p-2', 'unassessed-at-rule'],
    ['text-lg/6', 'unmapped-property'],
  ]) {
    assert.ok(forCandidate(name!).length > 0, name)
    assert.ok(
      forCandidate(name!)
        .flatMap((block) => block.writes)
        .every((write) => write.reason === reason),
      name,
    )
  }
})

test('multi-rule project candidates are assessed per property, never by guessing rule zero', async () => {
  const { snapshot } = await generatePortableOrder()
  const base = tailwindPackageDir()
  const css = readFileSync(`${base}/theme.css`, 'utf8')
  const compiler = createCompiler()
  const source = `import {View} from '@hozo/core';const el=<View className="p-2"/>`
  const before = compiler.compile(source)
  for (const [extra, reason] of [
    ['@utility p-2 { color:red; }', undefined],
    ['@utility p-2 { padding:1px; }', 'ambiguous-property-owner'],
    ['@utility p-2 { &:has(span) { padding:1px; } }', 'unassessed-selector'],
  ] as const) {
    const prepared = await prepareTailwindOrder(`${css}\n${extra}`, base, ['p-2'])
    compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
    const output = compiler.compile(source, undefined, { tailwindPlan: true })
    assert.deepEqual(strip(output), before)
    const writes = output.flatMap((entry) =>
      entry.tailwindPlan!.sites.flatMap((site) => site.blocks.flatMap((block) => block.writes)),
    )
    assert.ok(writes.length > 0)
    for (const write of writes) {
      assert.equal(write.reason, reason)
      if (!reason) {
        const rule = prepared.lookup('p-2')!.rules.find((rule) => rule.id === write.ruleId)!
        assert.match(JSON.stringify(rule.shape), /"property":"padding"/)
      }
    }
  }
  // Default project extraction and the portable extractor use the same facts,
  // but their input receipts/namespaces are deliberately not interchangeable.
  const project = await prepareTailwindOrder(
    css,
    base,
    snapshot.candidates.map((entry) => entry.candidate),
  )
  assert.deepEqual(project.snapshot.candidates, snapshot.candidates)
  assert.notEqual(project.snapshot.fingerprint, snapshot.fingerprint)
})
