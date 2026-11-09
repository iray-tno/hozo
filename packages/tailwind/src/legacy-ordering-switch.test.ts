import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, setLegacyOrderingForMeasurement } from '@hozo/compiler'

// `scripts/tailwind-order-old-path.mjs` reports how many components the
// ordering outside the shared plan still changes. A zero there is only a
// measurement if switching it off can change something; this is that
// control: an input with a barrier (an arbitrary value) keeps authored order,
// and only the interaction sort puts `hover:` before `focus:`.
test('switching the ordering outside the plan off changes an input it still decides', () => {
  const compiler = createCompiler()
  const source = `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="focus:p-2 hover:p-4 columns-[10rem]"/>`
  const outputs = [true, false].map((legacy) => {
    setLegacyOrderingForMeasurement(legacy)
    try {
      return [
        compiler.compile(source)[0]!.css,
        compiler.compileNativeModule(source).components[0]!.jsx,
      ]
    } finally {
      setLegacyOrderingForMeasurement(true)
    }
  })
  assert.notEqual(outputs[0]![0], outputs[1]![0])
  assert.notEqual(outputs[0]![1], outputs[1]![1])
  assert.match(outputs[0]![1]!, /hovered && hozoStyles\.hozo0_hover, focused &&/)
})
