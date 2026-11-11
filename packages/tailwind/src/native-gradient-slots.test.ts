import assert from 'node:assert/strict'
import test from 'node:test'
import { compileNative } from '@hozo/compiler'
import { __unstable__loadDesignSystem } from 'tailwindcss'
import { hozoGradientStyles } from '../../engine/src/gradient-slots.ts'

test('Native independently active gradient positions agree with actual Tailwind writers', async () => {
  const design = await __unstable__loadDesignSystem('@tailwind utilities;')
  const [from, to] = design.candidatesToCss(['from-25%', 'to-80%'])
  const fromPosition = from?.match(/--tw-gradient-from-position: ([^;]+);/)?.[1]
  const toPosition = to?.match(/--tw-gradient-to-position: ([^;]+);/)?.[1]
  assert.equal(fromPosition, '25%')
  assert.equal(toPosition, '80%')
  const result = compileNative(
    `import {Pressable} from '@hozo/core';export const C=()=> <Pressable className="bg-linear-to-r from-[#f00] to-[#00f] md:from-25% hover:to-80%"/>`,
  )[0]!
  assert.deepEqual(result.diagnostics, [])
  const start = result.jsx.indexOf('style={') + 7
  assert.ok(start > 6)
  let end = start
  let depth = 1
  for (; end < result.jsx.length; end++) {
    if (result.jsx[end] === '{') depth++
    if (result.jsx[end] === '}' && --depth === 0) break
  }
  const callback = new Function(
    'hozoStyles',
    'hozoGradientStyles',
    '__hozoBp_md',
    `return (${result.jsx.slice(start, end)})`,
  )(new Function(`return (${result.styles})`)(), hozoGradientStyles, true)
  const value = Object.assign({}, ...callback({ hovered: true }).flat(Infinity)).backgroundImage
  assert.match(value, new RegExp(` ${fromPosition}, .* ${toPosition}\\)$`))
})
