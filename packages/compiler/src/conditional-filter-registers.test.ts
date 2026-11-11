import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './index.ts'

// #1230. Tailwind keeps each filter function in its own register and reads
// them all in one `filter`, so `md:blur-sm grayscale` is
// `blur(8px) grayscale(100%)` at md. Hozo's md rule joined only its own
// `blur(8px)`, dropping the base grayscale.
function css(classes: string): string {
  return compile(`import { View } from '@hozo/core'
export function C() { return <View className="${classes}" /> }`)[0]!.css
}

test('filter functions under different conditions are registers read by one filter', () => {
  const split = css('md:blur-sm grayscale')
  assert.match(split, /@property --hozo-blur \{[^}]*inherits: false/)
  assert.match(split, /--hozo-grayscale: grayscale\(100%\);/)
  assert.match(split, /@media[^{]*\{\s*\.[\w-]+ \{[^}]*--hozo-blur: blur\(8px\);/)
  assert.match(
    split,
    /filter: var\(--hozo-blur,\) var\(--hozo-brightness,\) var\(--hozo-contrast,\) var\(--hozo-grayscale,\) var\(--hozo-hue-rotate,\) var\(--hozo-invert,\) var\(--hozo-saturate,\) var\(--hozo-sepia,\);/,
  )
})

test('backdrop filters read opacity before saturate, as Tailwind does', () => {
  const split = css('md:backdrop-blur-sm backdrop-opacity-50')
  assert.match(split, /-webkit-backdrop-filter: var\(--hozo-backdrop-blur,\)/)
  assert.match(
    split,
    /backdrop-filter: var\(--hozo-backdrop-blur,\) var\(--hozo-backdrop-brightness,\) var\(--hozo-backdrop-contrast,\) var\(--hozo-backdrop-grayscale,\) var\(--hozo-backdrop-hue-rotate,\) var\(--hozo-backdrop-invert,\) var\(--hozo-backdrop-opacity,\) var\(--hozo-backdrop-saturate,\) var\(--hozo-backdrop-sepia,\);/,
  )
})

test('literal backdrop filters use the register order, including the Safari prefix', () => {
  for (const classes of [
    'backdrop-sepia backdrop-saturate-150 backdrop-opacity-50',
    'backdrop-opacity-50 backdrop-saturate-150 backdrop-sepia',
    'hover:backdrop-sepia hover:backdrop-saturate-150 hover:backdrop-opacity-50',
  ]) {
    const output = css(classes)
    const declarations = [...output.matchAll(/(?:-webkit-)?backdrop-filter: ([^;]+);/g)]
    assert.equal(declarations.length, 2, output)
    for (const [, value] of declarations)
      assert.equal(value, 'opacity(50%) saturate(150%) sepia(100%)', classes)
    assert.doesNotMatch(output, /@property --hozo-backdrop/, classes)
  }
})

test('a responsive reset turns off a chain composed by earlier conditions', () => {
  const output = css('md:blur-sm grayscale lg:filter-none')
  assert.match(output, /--hozo-grayscale: grayscale\(100%\);/)
  assert.match(output, /@media \(width >= 768px\)[\s\S]*--hozo-blur: blur\(8px\);/)
  assert.match(output, /@media \(width >= 1024px\) \{\s*\.hozo-0 \{\s*filter: none;\s*\}/)
})

test('one condition, the same functions or a drop shadow keep literal output', () => {
  for (const classes of ['blur-sm grayscale', 'blur-sm md:blur-lg', 'md:blur-sm drop-shadow-md']) {
    assert.doesNotMatch(css(classes), /--hozo-(blur|grayscale|drop)/, classes)
  }
})
