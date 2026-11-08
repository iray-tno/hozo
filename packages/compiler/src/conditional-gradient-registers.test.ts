import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './index.ts'

// #1230. Tailwind's constructor writes `--tw-gradient-position` and a
// `background-image` reading `--tw-gradient-stops`; each colour and position
// is its own register. Hozo joined constructor and stops per condition, so a
// conditional constructor had no stops and a conditional colour no
// constructor.
function css(classes: string): string {
  return compile(`import { View } from '@hozo/core'
export function C() { return <View className="${classes}" /> }`)[0]!.css
}

test('a conditional constructor reads the base stops through registers', () => {
  const split = css('md:bg-linear-to-b bg-linear-to-r from-red-500')
  assert.match(split, /@property --hozo-gradient-from \{[^}]*initial-value: #0000;/)
  assert.match(split, /--hozo-gradient-from: [^;]+;/)
  assert.match(
    split,
    /@media[^{]*\{\s*\.[\w-]+ \{[^}]*--hozo-gradient-position: to bottom in oklab;[^}]*background-image: linear-gradient\(var\(--hozo-gradient-stops, var\(--hozo-gradient-position\)\)\);/,
  )
})

test('a conditional colour writes its register and the stop list, not background-image', () => {
  const split = css('md:via-green-500 bg-linear-to-r from-red-500 to-blue-500')
  const media = split.slice(split.indexOf('@media'))
  assert.match(media, /--hozo-gradient-via: /)
  assert.match(media, /--hozo-gradient-stops: var\(--hozo-gradient-via-stops\);/)
  assert.doesNotMatch(media.slice(0, media.indexOf('}')), /background-image/)
})

test('one condition, same slots, via-none and arbitrary images keep literal output', () => {
  for (const classes of [
    'bg-linear-to-r from-red-500 to-blue-500',
    'bg-linear-to-r from-red-500 md:bg-linear-to-l md:from-blue-500',
    'md:via-none bg-linear-to-r from-red-500 via-green-500',
    "md:bg-[url('/a.png')] bg-linear-to-r from-red-500",
  ]) {
    assert.doesNotMatch(css(classes), /--hozo-gradient/, classes)
  }
})
