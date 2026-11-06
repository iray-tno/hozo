import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { SourceProvenance } from '@hozo/compiler/lower'
import { transformHozoSource } from './transform.ts'

function observe(source: string) {
  const filename = path.resolve('NativeProvenance.tsx'),
    root = path.dirname(filename)
  const map = new SourceProvenance(source)
  const compiler = createCompiler()
  const original = compiler.compileNativeModule.bind(compiler)
  let parses = 0,
    events = 0
  compiler.compileNativeModule = (...args) => {
    parses++
    return original(...args)
  }
  const output = transformHozoSource(
    source,
    filename,
    root,
    compiler,
    undefined,
    (input, edits) => {
      events++
      map.apply(input, edits)
    },
  )
  const baseline = transformHozoSource(source, filename, root, createCompiler())
  assert.equal(output, baseline, 'observing must not change ordinary emitted bytes')
  assert.ok(output)
  assert.ok(map.matches(output), 'every emitted rewrite must be accounted for')
  assert.equal(parses, 1, 'provenance must not reparse Native source')
  assert.ok(events > 0)
  return { map, output }
}

test('Native edits preserve UTF-16 coordinates for untouched siblings, not rewritten JSX', () => {
  const source = `// 🌱 source offsets are UTF-16
import {View} from '@hozo/core';import {Toolbar} from '@hozo/patterns';
export const A=()=> <><View className="p-2"/><Toolbar items={[]} className="p-4"/></>`
  const { map, output } = observe(source)
  const start = source.indexOf('className="p-4"'),
    end = start + 'className="p-4"'.length
  const range = map.emitted(output, start, end)
  assert.ok(range)
  assert.equal(output.slice(range.spanStart, range.spanEnd), source.slice(start, end))
  const replaced = source.indexOf('className="p-2"')
  assert.equal(map.emitted(output, replaced, replaced + 15), undefined)
})

test('Native provenance accounts for Canvas edits, generated hooks and runtime/candidate imports', () => {
  for (const source of [
    `import {Canvas} from '@hozo/canvas';import {View} from '@hozo/core';
      export const A=()=> <><Canvas.Rect className="fill-red-500"/><View className="p-2"/></>`,
    `import {View,Text} from '@hozo/core';export function A(){return <>
      <View className="dark:p-4"/><Text className="md:text-xl">Hi</Text></>}`,
    `import {View} from '@hozo/core';export const A=()=> <View className={names}/>`,
  ])
    observe(source)
})

test('Native rewriting does not invent copied source inside a lowered parent', () => {
  const source = `import {View} from '@hozo/core';import {Toolbar} from '@hozo/patterns';
    export const A=()=> <View className="p-2"><Toolbar items={[]} className="p-4"/></View>`
  const { map, output } = observe(source)
  const start = source.indexOf('className="p-4"')
  assert.ok(output.includes('className="p-4"'), 'the backend may carry identical text')
  assert.equal(
    map.emitted(output, start, start + 15),
    undefined,
    'identical generated text is not copy evidence',
  )
})
