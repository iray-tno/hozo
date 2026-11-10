import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, setLegacyOrderingForMeasurement } from '@hozo/compiler'

// `scripts/tailwind-order-old-path.mjs` reports how many components the
// ordering outside the shared plan still changes. A zero there is only a
// measurement if switching it off can change something; this is that
// control. An input with a barrier (an arbitrary value) is not ranked, and
// only the condition-weight group sort puts `active:` (one state) before
// `hover:focus:` (two), so the more specific conjunction wins on Native.
test('switching the ordering outside the plan off changes an input it still decides', () => {
  const compiler = createCompiler()
  const source = `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="hover:focus:p-2 active:p-4 columns-(--layout)"/>`
  const outputs = [true, false].map((legacy) => {
    setLegacyOrderingForMeasurement(legacy)
    try {
      return compiler.compileNativeModule(source).components[0]!.jsx
    } finally {
      setLegacyOrderingForMeasurement(true)
    }
  })
  assert.notEqual(outputs[0], outputs[1])
  assert.match(outputs[0]!, /pressed && hozoStyles\.hozo0_pressed, hovered && focused &&/)
})
