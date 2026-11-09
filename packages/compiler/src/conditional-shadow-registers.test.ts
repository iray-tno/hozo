import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './index.ts'

// #1230. Tailwind keeps every shadow and ring layer, colour, the offset
// width and the inset flag in a register and reads five layers in one
// `box-shadow`, so `focus:ring-2 shadow-sm` keeps the shadow while focused.
// Hozo's focus rule replaced the whole declaration with the ring alone.
function css(classes: string): string {
  return compile(`import { Pressable } from '@hozo/core'
export function C() { return <Pressable accessibilityRole="button" className="${classes}" /> }`)[0]!
    .css
}

const reader =
  'box-shadow: var(--hozo-inset-shadow), var(--hozo-inset-ring-shadow), var(--hozo-ring-offset-shadow), var(--hozo-ring-shadow), var(--hozo-shadow);'

test('a ring under one condition and a shadow under another are layers of one box-shadow', () => {
  const split = css('focus:ring-2 shadow-sm')
  assert.ok(split.includes(reader), split)
  assert.match(split, /@property --hozo-shadow \{[^}]*inherits: false;\s*initial-value: 0 0 #0000;/)
  assert.match(split, /--hozo-shadow: 0 1px 3px 0 var\(--hozo-shadow-color, rgb\(0 0 0 \/ 0\.1\)\)/)
  assert.match(
    split,
    /:focus[^{]*\{[^}]*--hozo-ring-shadow: var\(--hozo-ring-inset,\) 0 0 0 calc\(2px \+ var\(--hozo-ring-offset-width\)\) var\(--hozo-ring-color, currentcolor\);/,
  )
})

test('a colour under a condition repaints the base shadow through its register', () => {
  const split = css('md:shadow-red-500 shadow-lg')
  assert.match(split, /@media[^{]*\{\s*\.[\w-]+ \{[^}]*--hozo-shadow-color: /)
  assert.ok(split.includes(reader), split)
})

test('one condition and same-slot conditions keep the literal box-shadow', () => {
  for (const classes of ['ring-2 shadow-sm', 'shadow-sm md:shadow-lg', 'ring-2 focus:ring-4']) {
    const out = css(classes)
    assert.doesNotMatch(out, /--hozo-(shadow|ring)/, classes)
  }
})
