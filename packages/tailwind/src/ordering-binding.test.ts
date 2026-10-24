// Real upstream snapshots -> actual parser-retained utility IDs -> Rust
// binding. This is not a claim about cascade winners or Native pixels.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const source = `import { View, Pressable, Text, Avatar, cx } from '@hozo/core';
const padding='p-2';
export const A=({active,extra}) => <Pressable className={cx(padding, 'hover:p-4', active && 'p-4', extra)}>
  <Avatar fallbackClassName="font-bold text-lg"/>
  <Text className="text-lg w-[23px]">Nested</Text>
</Pressable>;
export const B=()=> <View className="p-2"/>;`

test('module/secondary IDs bind to all upstream rules without changing either target output', async () => {
  // Deliberately give a builtin another upstream rule. Hozo supporting p-2
  // does not imply it can lower this custom color rule: keep both facts.
  const prepared = await prepareTailwindOrder(`${css}\n@utility p-2 { color: red; }`, base, [
    'font-bold',
    'hover:p-4',
    'p-2',
    'p-4',
    'text-lg',
  ])
  assert.equal(prepared.lookup('p-2')!.rules.length, 2)
  const compiler = createCompiler()
  const before = {
    web: compiler.compile(source),
    native: compiler.compileNativeModule(source),
  }
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  const inspection = compiler.inspectTailwindOrder(source)
  assert.deepEqual(inspection.syntaxDiagnostics, [])
  assert.equal(inspection.fingerprint, prepared.snapshot.fingerprint)
  assert.equal(inspection.candidates.length, 6)
  assert.deepEqual(
    inspection.candidates.map((entry) => entry.utilityId),
    [0, 1, 2, 3, 4, 5],
  )
  for (const entry of inspection.candidates) {
    const descriptor = prepared.lookup(entry.candidate)
    if (entry.candidate === 'w-[23px]') {
      assert.equal(entry.status, 'uncollected')
      assert.equal(entry.candidateId, undefined)
      assert.deepEqual(entry.ruleIds, [])
      continue
    }
    assert.ok(descriptor)
    assert.equal(entry.status, 'described')
    assert.equal(entry.candidateId, descriptor.id)
    assert.deepEqual(
      entry.ruleIds,
      descriptor.rules.map((rule) => rule.id),
    )
  }
  assert.notEqual(inspection.candidates[0]!.utilityId, inspection.candidates[0]!.candidateId)
  assert.deepEqual(compiler.compile(source), before.web)
  assert.deepEqual(compiler.compileNativeModule(source), before.native)
  assert.deepEqual(compiler.inspectTailwindOrder(source), inspection)
  compiler.setTailwindOrder()
  assert.equal(compiler.inspectTailwindOrder(source).fingerprint, undefined)
  assert.ok(
    compiler
      .inspectTailwindOrder(source)
      .candidates.every((entry) => entry.status === 'no-context'),
  )
  assert.deepEqual(compiler.compile(source), before.web)
  assert.deepEqual(compiler.compileNativeModule(source), before.native)
})

test('not-generated, uncollected and no-context stay distinct and old namespaces are not reused', async () => {
  const compiler = createCompiler()
  const input = `import {View} from '@hozo/core'; const el=<View className="p-2 w-[23px]"/>`
  const get = () => compiler.inspectTailwindOrder(input)
  assert.deepEqual(
    get().candidates.map((entry) => entry.status),
    ['no-context', 'no-context'],
  )
  const emptyTheme = await prepareTailwindOrder('', base, ['p-2'])
  compiler.setTailwindOrder(JSON.stringify(emptyTheme.snapshot))
  assert.deepEqual(
    get().candidates.map((entry) => entry.status),
    ['not-generated', 'uncollected'],
  )
  assert.equal(get().candidates[0]!.candidateId, emptyTheme.lookup('p-2')!.id)
  assert.deepEqual(get().candidates[0]!.ruleIds, [])
  const full = await prepareTailwindOrder(css, base, ['p-2', 'w-[23px]', 'hover:p-4'])
  compiler.setTailwindOrder(JSON.stringify(full.snapshot))
  assert.equal(get().fingerprint, full.snapshot.fingerprint)
  assert.notEqual(full.snapshot.fingerprint, emptyTheme.snapshot.fingerprint)
  assert.ok(get().candidates.every((entry) => entry.status === 'described'))
  const different = `import {View} from '@hozo/core'; const el=<View className="w-[23px] p-2"/>`
  const reversed = compiler.inspectTailwindOrder(different)
  assert.equal(reversed.candidates[0]!.utilityId, 0)
  assert.equal(reversed.candidates[0]!.candidate, 'w-[23px]')
  assert.equal(reversed.candidates[0]!.candidateId, full.lookup('w-[23px]')!.id)
})

test('malformed snapshots fail before replacing a valid context', async () => {
  const compiler = createCompiler()
  const prepared = await prepareTailwindOrder(css, base, ['p-2', 'hover:p-4'])
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  const input = `import {View} from '@hozo/core'; const el=<View className="p-2"/>`
  const before = compiler.inspectTailwindOrder(input)
  const mutations = [
    (data) => {
      data.schema = 2
    },
    (data) => {
      data.policy = 'other'
    },
    (data) => {
      data.fingerprint = 'broken'
    },
    (data) => {
      data.candidates[1].id = 0
    },
    (data) => {
      data.candidates[1].candidate = data.candidates[0].candidate
    },
    (data) => {
      data.candidates[0].rules[0].candidateId = 999
    },
    (data) => {
      data.candidates[0].rules[0].id = 999
    },
    (data) => {
      data.candidates[0].rules[0].variantOrder = '-1'
    },
    (data) => {
      data.candidates[0].rules[0].variantOrder = '01'
    },
    (data) => {
      data.candidates[0].rules[0].propertyOrder = [2, 1]
    },
    (data) => {
      data.candidates[0].rules[0].shape.kind = 'future-kind'
    },
    (data) => {
      data.candidates[0].status = 'not-generated'
    },
    (data) => {
      data.candidates[0].rules = []
    },
    (data) => {
      data.extraSchemaField = true
    },
  ]
  for (const change of mutations) {
    const data = structuredClone(prepared.snapshot)
    change(data)
    assert.throws(() => compiler.setTailwindOrder(JSON.stringify(data)))
    assert.deepEqual(compiler.inspectTailwindOrder(input), before)
  }
  assert.throws(() => compiler.setTailwindOrder('{'))
  assert.deepEqual(compiler.inspectTailwindOrder(input), before)
})

test('inspection respects declared class helpers, foreign imports, syntax and empty modules', async () => {
  const compiler = createCompiler()
  const prepared = await prepareTailwindOrder(css, base, ['p-2'])
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  assert.deepEqual(compiler.inspectTailwindOrder('const plain=1').candidates, [])
  assert.deepEqual(
    compiler.inspectTailwindOrder(`import {View} from 'foreign'; const el=<View className="p-2"/>`)
      .candidates,
    [],
  )
  const helper = `import {View} from '@hozo/core'; import {join} from './classes';
    const el=<View className={join('p-2', extra)}/>`
  assert.deepEqual(compiler.inspectTailwindOrder(helper).candidates, [])
  compiler.setClassHelpers([{ module: './classes', name: 'join' }])
  assert.equal(compiler.inspectTailwindOrder(helper).candidates[0]!.candidate, 'p-2')
  const broken = 'const emoji="😀"; const el = <View className="p-2"'
  assert.deepEqual(
    compiler.inspectTailwindOrder(broken).syntaxDiagnostics,
    compiler.compileNativeModule(broken).syntaxDiagnostics,
  )
  assert.ok(compiler.inspectTailwindOrder(broken).syntaxDiagnostics.length > 0)
})

test('inspection is not a lexical completeness claim and leaves opaque combinations in fallback', async () => {
  const compiler = createCompiler()
  const input = `import {Pressable,cx} from '@hozo/core';
    const el=<Pressable className={cx('p-2', active && 'hover:p-4', extra)}/>`
  const before = compiler.compileNativeModule(input)
  assert.match(
    before.components[0]!.jsx,
    /hozoClasses\(active && 'hover:p-4', \{ pressed, hovered, focused, focusVisible \}\)/,
  )
  const prepared = await prepareTailwindOrder(css, base, ['p-2', 'hover:p-4'])
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  assert.deepEqual(
    compiler.inspectTailwindOrder(input).candidates.map((entry) => entry.candidate),
    ['p-2'],
  )
  assert.deepEqual(compiler.compileNativeModule(input), before)
})
