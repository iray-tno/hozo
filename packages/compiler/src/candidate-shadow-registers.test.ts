import assert from 'node:assert/strict'
import test from 'node:test'
import { openCandidateCache } from './index.ts'

function sheet(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  return cache.renderCss()
}

test('shadow and ring candidates use the static five-layer reader', () => {
  const css = sheet(['shadow-sm', 'focus:ring-2', 'inset-shadow-sm', 'hover:shadow-none'])
  assert.equal([...css.matchAll(/@property --hozo-/g)].length, 12)
  assert.match(css, /@property --hozo-shadow \{\s+syntax: "\*";\s+inherits: false;/)
  assert.match(css, /--hozo-shadow: 0 0 #0000;/)
  assert.match(css, /--hozo-shadow: 0 1px 3px 0 var\(--hozo-shadow-color, rgb\(0 0 0 \/ 0.1\)\)/)
  assert.match(
    css,
    /--hozo-ring-shadow: var\(--hozo-ring-inset,\) 0 0 0 calc\(2px \+ var\(--hozo-ring-offset-width\)\)/,
  )
  assert.equal(
    [
      ...css.matchAll(
        /box-shadow: var\(--hozo-inset-shadow\), var\(--hozo-inset-ring-shadow\), var\(--hozo-ring-offset-shadow\), var\(--hozo-ring-shadow\), var\(--hozo-shadow\);/g,
      ),
    ].length,
    8,
  )
  assert.doesNotMatch(css, /@property --hozo-(?:blur|translate|gradient)/)
})

test('colour, offset and inset modifiers write registers without asserting box-shadow ownership', () => {
  const css = sheet([
    'shadow-red-500',
    'ring-[#0f0]',
    'ring-offset-2',
    'ring-offset-black',
    'ring-inset',
  ])
  assert.match(css, /--hozo-shadow-color: oklch\(/)
  assert.match(css, /--hozo-ring-color: #0f0;/)
  assert.match(css, /--hozo-ring-offset-width: 2px;/)
  assert.match(css, /--hozo-ring-offset-color: #000;/)
  assert.match(css, /--hozo-ring-inset: inset;/)
  assert.doesNotMatch(css, /^ +box-shadow:/m)
})

test('shadow registrations are deduplicated alongside other used families', () => {
  assert.doesNotMatch(sheet(['p-4']), /@property/)
  const css = sheet(['shadow-sm', 'ring-2', 'backdrop-blur-sm'])
  assert.equal([...css.matchAll(/@property --hozo-/g)].length, 21)
  assert.equal([...css.matchAll(/@property --hozo-shadow \{/g)].length, 1)
})
