// #2048 piece 2: a class a file hands to the run-time resolver, absent from
// the map the device holds, is reported with where it is written. #1297's
// case is the model: a docs demo handed a component its bar size as a string,
// the showcase's scan did not cover the demo, and the bar did not draw.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler } from './index.ts'
import { classesMissingFromRuntimeMap } from './project.ts'

const compiler = createCompiler()

const demo = `import { Skeleton } from './skeleton'
export const Demo = () => (
  <Skeleton barClassName="h-4 w-32 my-card" />
)
`

test('a class handed to a component and absent from the run-time map is reported where it is written', () => {
  const found = classesMissingFromRuntimeMap(demo, '/app/docs/demo.tsx', new Set(), compiler)
  assert.deepEqual(
    found.map(({ code }) => code),
    ['CLASS_NOT_IN_RUNTIME_MAP', 'CLASS_NOT_IN_RUNTIME_MAP'],
  )
  assert.deepEqual(
    found.map(({ message }) => message.match(/^`([^`]+)` \(([^)]+)\)/)?.slice(1)),
    [
      ['h-4', 'demo.tsx:3'],
      ['w-32', 'demo.tsx:3'],
    ],
  )
  for (const { spanStart, spanEnd, message } of found)
    assert.equal(demo.slice(spanStart, spanEnd), message.match(/^`([^`]+)`/)?.[1])
})

test('nothing is reported when the map has the classes, for a name Native cannot draw, or for a static class', () => {
  assert.deepEqual(
    classesMissingFromRuntimeMap(demo, '/app/docs/demo.tsx', new Set(['h-4', 'w-32']), compiler),
    [],
    '`my-card` is the project’s own marker: no map could resolve it',
  )
  const compiled = `import { View } from '@hozo/core'
export const Card = () => <View className="p-4 bg-red-500" />
`
  assert.deepEqual(
    classesMissingFromRuntimeMap(compiled, '/app/card.tsx', new Set(), compiler),
    [],
    'a static className compiles; the device never looks it up',
  )
  // Shaped like a class, scanned like one, and not one: no style, no report.
  const label = `export const go = () => markPressed('rounded-rect')\n`
  assert.deepEqual(classesMissingFromRuntimeMap(label, '/app/bench.tsx', new Set(), compiler), [])
})

test('a declared marker is not reported, by exact name or by prefix (#2073)', () => {
  const filter = `export const F = () => <Filter type="saturate" barClassName="h-4 w-32" />\n`
  const named = (markers: string[]) =>
    classesMissingFromRuntimeMap(filter, '/app/f.tsx', new Set(), compiler, undefined, markers).map(
      ({ message }) => message.match(/^`([^`]+)`/)?.[1],
    )
  assert.deepEqual(named([]), ['h-4', 'saturate', 'w-32'])
  assert.deepEqual(named(['saturate', 'w-*']), ['h-4'])
})
