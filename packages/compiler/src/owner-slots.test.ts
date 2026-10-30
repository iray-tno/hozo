import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, inspectOwnerClassSlots, type OwnerSlotBinding } from './index.ts'

const target: OwnerSlotBinding = {
  source: '@hozo/patterns',
  imported: 'BottomSheet',
  classProp: 'handleClassName',
  preparedProp: 'hozoHandleStyle',
}
const inspect = (source: string) => inspectOwnerClassSlots(source, [target], 'Caller.tsx')

test('caller sites follow actual named import symbols through aliases and lexical shadowing', () => {
  const source = `import {BottomSheet as Sheet} from '@hozo/patterns';
import {BottomSheet} from 'foreign'; import type {BottomSheet as TypeOnly} from '@hozo/patterns';
const text='Sheet handleClassName="p-8"'; // <Sheet handleClassName="p-9"/>
export const Real=()=> <Sheet<Item> handleClassName="p-2"/>;
function Shadow(Sheet){return <Sheet handleClassName="p-3"/>}
const other=<BottomSheet handleClassName="p-4"/>; const type=<TypeOnly handleClassName="p-5"/>;`
  const result = inspect(source)
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.sites.length, 1)
  assert.equal(result.sites[0]!.classes, 'p-2')
  assert.equal(
    source.slice(result.sites[0]!.spanStart, result.sites[0]!.spanEnd),
    'handleClassName="p-2"',
  )
  assert.equal(
    createCompiler().compileNativeModule(source).components.length,
    0,
    'inspection must not turn BottomSheet into a Primitive',
  )
})

test('caller edit coordinates are UTF-16 and literal values come from the AST', () => {
  const source = `// 🧩 日本語\nimport {BottomSheet as Sheet} from '@hozo/patterns'; const a=<Sheet handleClassName={'p-2 bg-[#ffffff]'} />`
  const result = inspect(source)
  assert.equal(result.sites.length, 1)
  assert.equal(
    source.slice(result.sites[0]!.spanStart, result.sites[0]!.spanEnd),
    "handleClassName={'p-2 bg-[#ffffff]'}",
  )
  assert.equal(result.sites[0]!.classes, 'p-2 bg-[#ffffff]')
  assert.deepEqual(inspectOwnerClassSlots(source, [target], 'Caller.jsx'), result)
})

test('spreads, duplicates, private carriers, opaque values and namespaces stay explicitly unassessed', () => {
  for (const [props, reason, count] of [
    ['{...props} handleClassName="p-2"', 'spread', 1],
    ['handleClassName="p-2" {...props}', 'spread', 1],
    ['handleClassName="p-2" handleClassName="p-3"', 'duplicate-class', 2],
    ['handleClassName="p-2" hozoHandleStyle={mine}', 'prepared-present', 1],
    ['handleClassName={input.value}', 'nonliteral', 1],
    ['handleClassName', 'nonliteral', 1],
  ] as const) {
    const result = inspect(
      `import {BottomSheet} from '@hozo/patterns'; const a=<BottomSheet ${props}/>`,
    )
    assert.deepEqual(result.diagnostics, [])
    assert.equal(result.sites.length, count)
    for (const site of result.sites) {
      assert.equal(site.reason, reason)
      assert.ok(site.classes == null)
    }
  }
  const namespace = inspect(
    `import * as UI from '@hozo/patterns'; const a=<UI.BottomSheet handleClassName="p-2"/>`,
  )
  assert.equal(namespace.sites.length, 1)
  assert.equal(namespace.sites[0]!.reason, 'namespace-import')
})

test('syntax and mutable import failures cannot masquerade as a valid empty census', () => {
  for (const source of [
    `import {BottomSheet} from '@hozo/patterns'; const broken = ;`,
    `import {BottomSheet} from '@hozo/patterns'; BottomSheet=Other; const a=<BottomSheet handleClassName="p-2"/>`,
  ]) {
    const result = inspect(source)
    assert.deepEqual(result.sites, [])
    assert.ok(result.diagnostics.length > 0)
    assert.ok(result.diagnostics.every((d) => d.severity === 'error'))
  }
})

test('target indices preserve independent contributions and ambiguous configuration is rejected', () => {
  const bindings = [
    target,
    { ...target, classProp: 'handleBarClassName', preparedProp: 'hozoBarStyle' },
  ]
  const source = `import {BottomSheet} from '@hozo/patterns'; const a=<BottomSheet handleBarClassName="p-3" handleClassName="p-2"/>`
  const result = inspectOwnerClassSlots(source, bindings)
  assert.deepEqual(
    result.sites.map((site) => [site.target, site.classes]),
    [
      [1, 'p-3'],
      [0, 'p-2'],
    ],
  )
  assert.throws(
    () => inspectOwnerClassSlots(source, [target, target]),
    /duplicate owner slot binding/,
  )
  assert.throws(
    () => inspectOwnerClassSlots(source, [{ ...target, preparedProp: target.classProp }]),
    /Invalid/,
  )
  assert.throws(
    () => inspectOwnerClassSlots(source, [{ ...target, preparedProp: 'props.callback()' }]),
    /Invalid/,
  )
  assert.throws(
    () =>
      inspectOwnerClassSlots(
        source,
        Array.from({ length: 65 }, () => target),
      ),
    /Invalid/,
  )
})

test('module insertion facts preserve hashbangs and client/strict directives', () => {
  for (const prefix of [
    '#!/usr/bin/env node',
    "#!/usr/bin/env node\n'use client';\n'use strict';",
    "'use client';",
  ]) {
    const source = `${prefix}\nimport {BottomSheet} from '@hozo/patterns'; const a=<BottomSheet handleClassName="p-2"/>`
    const result = inspect(source)
    assert.deepEqual(result.diagnostics, [])
    assert.equal(result.sites.length, 1)
    assert.equal(source.slice(0, result.insertionOffset), prefix)
  }
})
