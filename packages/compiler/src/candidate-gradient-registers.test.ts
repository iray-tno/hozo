import assert from 'node:assert/strict'
import test from 'node:test'
import { openCandidateCache } from './index.ts'

function sheet(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  return cache.renderCss()
}

test('candidate gradients share the static writer and nine non-inheriting registers', () => {
  const css = sheet([
    'bg-linear-to-r',
    'from-red-500',
    'hover:to-blue-500',
    'focus:from-25%',
    'via-none',
  ])
  assert.match(
    css,
    /background-image: linear-gradient\(var\(--hozo-gradient-stops, var\(--hozo-gradient-position\)\)\);/,
  )
  assert.match(css, /--hozo-gradient-from: oklch\(63.7% 0.237 25.331\);/)
  assert.match(css, /--hozo-gradient-to: oklch\(62.3% 0.214 259.815\);/)
  assert.match(css, /--hozo-gradient-from-position: 25%;/)
  assert.match(css, /--hozo-gradient-via-stops: initial;/)
  assert.equal([...css.matchAll(/@property --hozo-/g)].length, 9)
  assert.match(css, /@property --hozo-gradient-from \{\s+syntax: "\*";\s+inherits: false;/)
  assert.doesNotMatch(css, /@property --hozo-(?:translate|shadow|blur|backdrop)/)
})

test('gradient and filter readers share their minimal register union exactly once', () => {
  const css = sheet(['bg-radial', 'from-red-500', 'blur-sm', 'sepia'])
  assert.equal([...css.matchAll(/@property --hozo-/g)].length, 17)
  assert.equal([...css.matchAll(/@property --hozo-gradient-from \{/g)].length, 1)
  assert.match(css, /background-image: radial-gradient\(var\(--hozo-gradient-stops/)
  assert.match(css, /filter: var\(--hozo-blur,/)
})

test('unrelated sheets and whole-image resets retain their existing paths', () => {
  for (const name of ['p-4', 'bg-none', 'bg-[url(test.png)]'])
    assert.doesNotMatch(sheet([name]), /@property/, name)
  assert.match(sheet(['bg-none']), /background-image: none;/)
})
