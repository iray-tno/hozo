import assert from 'node:assert/strict'
import test from 'node:test'
import { ownerFixtureShadow } from '../../../scripts/style-slots/owner-fixture.mjs'
import { createCompiler, inspectOwnerClassSlots } from './index.ts'
import { previewOwnerLiteralCallers } from './owner-caller-plan.ts'

const shadow = ownerFixtureShadow('BottomSheet.handle')
const options = { source: '@hozo/patterns', imported: 'BottomSheet', shadow }
const compiler = createCompiler()

test('literal caller preview consumes only the targeted attribute and preserves authored evaluation', () => {
  const source = `#!/usr/bin/env node\n'use client';
import {BottomSheet as Sheet} from '@hozo/patterns';
export const X=()=> <Sheet open={open} handleStyle={input.value} handleClassName="p-[8px] opacity-50 bg-[#ffffff]" onClose={close}>Body</Sheet>`
  const result = previewOwnerLiteralCallers(source, compiler, options)
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.scope, 'explicit-direct-compiler-preview')
  assert.equal(result.findings.length, 1)
  assert.equal(result.findings[0]!.disposition, 'prepared-literal')
  assert.ok(result.code.startsWith("#!/usr/bin/env node\n'use client';"))
  assert.match(
    result.code,
    /<Sheet open=\{open\} handleStyle=\{input.value\} hozoHandleStyle=\{__hozoOwnerPlan\d+\} onClose=\{close\}>Body<\/Sheet>/,
  )
  assert.equal((result.code.match(/input.value/g) ?? []).length, 1)
  assert.match(result.code, /\.create\(/)
  assert.match(result.code, /paddingTop: 8/)
  assert.deepEqual(
    previewOwnerLiteralCallers(result.code, compiler, options).code,
    result.code,
    'second pass must not double-prepare',
  )
})

test('module plans are hoisted, shared and never shadowed by caller locals', () => {
  const source = `import {BottomSheet} from '@hozo/patterns';
export function X(__hozoOwnerStyleSheet0,__hozoOwnerPlan1){return <><BottomSheet handleClassName="p-2"/><BottomSheet handleClassName="p-2"/></>}`
  const result = previewOwnerLiteralCallers(source, compiler, options)
  assert.equal(result.findings.filter((f) => f.disposition === 'prepared-literal').length, 2)
  assert.equal((result.code.match(/\.create\(/g) ?? []).length, 1)
  const names = [...result.code.matchAll(/hozoHandleStyle=\{(\w+)\}/g)].map((m) => m[1])
  assert.equal(names[0], names[1])
  assert.notEqual(names[0], '__hozoOwnerPlan1')
  assert.ok(!result.code.includes('StyleSheet as __hozoOwnerStyleSheet0}'))
})

test('opaque and unsafe callers remain byte-for-byte original, not diagnosed away', () => {
  for (const props of [
    '{...base} handleClassName="p-2"',
    'handleClassName={input.value}',
    'handleClassName="p-2" hozoHandleStyle={own}',
    'handleClassName="p-2" handleClassName="p-3"',
  ]) {
    const source = `import {BottomSheet} from '@hozo/patterns'; const a=<BottomSheet ${props}/>`
    const result = previewOwnerLiteralCallers(source, compiler, options)
    assert.equal(result.code, source)
    assert.ok(result.findings.length > 0)
    assert.ok(result.findings.every((f) => f.disposition === 'retained' && f.reason))
  }
})

test('a class needing unavailable shape state or another adapter keeps its original carrier', () => {
  for (const classes of [
    'p-2 hover:opacity-50',
    'not-enabled:opacity-50',
    'not-aria-selected:opacity-50',
    'grid grid-cols-2',
    'md:p-2',
    'text-red-500',
    'p-2 hozo-unknown-utility',
  ]) {
    const source = `import {BottomSheet} from '@hozo/patterns'; const a=<BottomSheet handleClassName="${classes}"/>`
    const result = previewOwnerLiteralCallers(source, compiler, options)
    assert.equal(result.code, source, classes)
    assert.equal(result.findings[0]!.reason, 'shape-unassessed')
    assert.ok(result.findings[0]!.notes.length > 0)
  }
})

test('foreign/shadowed bindings and malformed modules cannot gain a prepared prop', () => {
  for (const source of [
    `import {BottomSheet} from 'other'; const a=<BottomSheet handleClassName="p-2"/>`,
    `import {BottomSheet} from '@hozo/patterns'; function X(BottomSheet){return <BottomSheet handleClassName="p-2"/>}`,
    `import {BottomSheet} from '@hozo/patterns'; const broken=;`,
  ])
    assert.equal(previewOwnerLiteralCallers(source, compiler, options).code, source)
  const ordinary = `import {BottomSheet} from '@hozo/patterns'; const a=<BottomSheet handleClassName="p-2"/>`
  assert.equal(compiler.compileNativeModule(ordinary).components.length, 0)
  assert.equal(
    inspectOwnerClassSlots(ordinary, [
      { ...options, classProp: 'handleClassName', preparedProp: 'hozoHandleStyle' },
    ]).sites.length,
    1,
  )
})

test('the box-only caller contract cannot consume a split-label carrier', () => {
  const source = `import {BottomSheet} from '@hozo/patterns';const a=<BottomSheet handleClassName="p-2"/>`
  const unexpectedText = {
    ...compiler,
    compileNativeModule(...args: Parameters<typeof compiler.compileNativeModule>) {
      const result = compiler.compileNativeModule(...args)
      for (const root of result.components)
        if (root.ownerStyle) root.ownerStyle = { ...root.ownerStyle, splitText: true }
      return result
    },
  }
  const result = previewOwnerLiteralCallers(source, unexpectedText, options)
  assert.equal(result.code, source)
  assert.equal(result.findings[0]!.reason, 'shape-unassessed')
})
