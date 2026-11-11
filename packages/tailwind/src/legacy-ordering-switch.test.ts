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
      return {
        native: compiler.compileNativeModule(source).components[0]!.jsx,
        web: compiler.compile(source)[0]!.css,
      }
    } finally {
      setLegacyOrderingForMeasurement(true)
    }
  })
  assert.notEqual(outputs[0]!.native, outputs[1]!.native)
  assert.match(outputs[0]!.native, /pressed && hozoStyles\.hozo0_pressed, hovered && focused &&/)
  assert.equal(outputs[0]!.web, outputs[1]!.web)
  // The conjunction is deliberately written first. Browser specificity, not
  // stylesheet order, must make it win; Native still linearizes these groups.
  assert.match(outputs[0]!.web, /:hover:focus[\s\S]*:active/)
})
