import assert from 'node:assert/strict'
import test from 'node:test'
import { compile, openCandidateCache } from './index.ts'

function sheet(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  return cache.renderCss()
}

test('Web candidate filters share the static reader and non-inheriting registration set', () => {
  const css = sheet(['blur-sm', 'sepia', 'hover:grayscale'])
  assert.match(css, /--hozo-blur: blur\(8px\);/)
  assert.match(css, /--hozo-sepia: sepia\(100%\);/)
  assert.match(css, /--hozo-grayscale: grayscale\(100%\);/)
  assert.match(css, /filter: var\(--hozo-blur,\) var\(--hozo-brightness,\)/)
  assert.equal([...css.matchAll(/@property --hozo-blur \{/g)].length, 1)
  assert.match(css, /@property --hozo-blur \{\s+syntax: "\*";\s+inherits: false;/)
  assert.equal([...css.matchAll(/@property --hozo-/g)].length, 8)
  assert.doesNotMatch(css, /@property --hozo-(?:translate|shadow|gradient|backdrop)/)
})

test('candidate reader families share one subset while static output keeps its registry', () => {
  const css = sheet(['translate-x-2', 'blur-sm', 'sepia'])
  assert.equal([...css.matchAll(/@property --hozo-/g)].length, 11)
  assert.equal([...css.matchAll(/@property --hozo-blur \{/g)].length, 1)
  assert.match(css, /@property --hozo-translate-x \{[\s\S]*?initial-value: 0;/)
  assert.match(css, /filter: var\(--hozo-blur,\)/)
  const staticCss = compile(
    'import {View} from \'@hozo/core\';export const C=()=> <View className="blur-sm md:sepia"/>',
  )[0]!.css
  assert.match(staticCss, /@property --hozo-shadow \{/)
  assert.equal([...staticCss.matchAll(/@property --hozo-/g)].length, 49)
})

test('unrelated sheets and standalone reset or drop shadow forms need no registers', () => {
  for (const name of ['p-4', 'filter-none', 'drop-shadow-sm', 'backdrop-filter-none']) {
    assert.doesNotMatch(sheet([name]), /@property/, name)
  }
})

test('static resets retain ordinary registers only when another condition reads them', () => {
  const source = (classes: string) =>
    `import {Pressable} from '@hozo/core';const el=<Pressable className="${classes}"/>`
  const split = compile(source('blur-sm filter-none hover:sepia'))[0]!.css
  assert.match(split, /\.hozo-0 \{[^}]*--hozo-blur: blur\(8px\);[^}]*filter: none;/)
  assert.match(split, /:hover \{[^}]*filter: var\(--hozo-blur,\)/)
  for (const classes of [
    'blur-sm filter-none',
    'blur-sm hover:blur-lg filter-none',
    'blur-sm filter-none hover:sepia drop-shadow-sm',
  ]) {
    assert.doesNotMatch(compile(source(classes))[0]!.css, /@property --hozo-blur/, classes)
  }
})

test('backdrop candidates compose through a separate non-inheriting family', () => {
  const css = sheet(['backdrop-blur-sm', 'hover:backdrop-opacity-50', 'backdrop-saturate-150'])
  assert.equal([...css.matchAll(/@property --hozo-/g)].length, 9)
  assert.match(css, /@property --hozo-backdrop-blur \{\s+syntax: "\*";\s+inherits: false;/)
  assert.match(css, /--hozo-backdrop-opacity: opacity\(50%\);/)
  const readers = [...css.matchAll(/^ +(-webkit-)?backdrop-filter: ([^;]+);/gm)]
  assert.equal(readers.length, 12, css)
  for (const [index, reader] of readers.entries()) {
    assert.equal(reader[1], index % 2 === 0 ? '-webkit-' : undefined)
    assert.match(reader[2]!, /var\(--hozo-backdrop-opacity,\) var\(--hozo-backdrop-saturate,\)/)
    assert.equal(reader[2], readers[index ^ 1]![2])
  }
  assert.equal(
    [...sheet(['blur-sm', 'backdrop-blur-sm']).matchAll(/@property --hozo-/g)].length,
    17,
  )
})
