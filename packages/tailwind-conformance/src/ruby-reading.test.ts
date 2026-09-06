// Ruby that is read once.
//
// React Native flattens nested `Text` into one accessibility node, so a
// screen reader read the base and then the reading: 「漢字かんじ」 -- the
// word twice, the second time spelled out. The `accessible={false}` that
// used to be on the annotation could not stop it, because the flattening
// happens above: the parent's label is built from the text it contains
// whatever the children say about themselves.
//
// The lever that works is the parent's own `accessibilityLabel`, which
// replaces the children rather than being assembled from them. The
// compiler writes it when the word is static, and `HozoRuby` reads it at
// runtime when it is not -- two paths, so what these pin hardest is that
// the two agree.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)

interface Root {
  toJSON: () => Tree
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => Root
  act: (callback: () => void) => void
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown) => unknown
}

const IMPORTS = "import { Ruby, RubyText } from '@hozo/core'\n"

function render(body: string, scope: Record<string, unknown> = {}) {
  const exports = loadNativeModule(`${IMPORTS}export function W() { return ${body} }\n`)
  const globals = globalThis as Record<string, unknown>
  const restore = Object.keys(scope).map((key) => [key, globals[key]] as const)
  Object.assign(globals, scope)
  try {
    let root: Root | undefined
    renderer.act(() => {
      root = renderer.create(react.createElement(exports.W))
    })
    assert.ok(root)
    return root.toJSON()
  } finally {
    for (const [key, value] of restore) globals[key] = value
  }
}

/** What a screen reader is given: the label if there is one, else the text. */
function announced(tree: Tree | string | null): string {
  if (tree === null) return ''
  if (typeof tree === 'string') return tree
  const label = tree.props.accessibilityLabel
  if (typeof label === 'string') return label
  return ((tree.children ?? []) as (Tree | string)[]).map(announced).join('')
}

test('a static reading is not announced after the word', () => {
  const tree = render('<Ruby>漢字<RubyText>かんじ</RubyText></Ruby>')
  assert.equal(announced(tree), '漢字')
})

test('a reading the compiler cannot read is not announced either', () => {
  // The same word through the other path: nothing is static, so the label
  // is `HozoRuby`'s to work out.
  const tree = render('<Ruby>{word}<RubyText>{reading}</RubyText></Ruby>', {
    word: '漢字',
    reading: 'かんじ',
  })
  assert.equal(announced(tree), '漢字')
})

test('the two paths agree, which is the only thing keeping them honest', () => {
  const compiled = render('<Ruby>東京<RubyText>とうきょう</RubyText></Ruby>')
  const runtime = render('<Ruby>{a}<RubyText>{b}</RubyText></Ruby>', {
    a: '東京',
    b: 'とうきょう',
  })
  assert.equal(announced(compiled), announced(runtime))
  assert.equal(announced(compiled), '東京')
})

test('a base with styling inside it is still the base', () => {
  const tree = render('<Ruby><RubyText>かん</RubyText>漢</Ruby>')
  assert.equal(announced(tree), '漢', 'the reading was announced because it came first')
})

test('an author’s own label wins', () => {
  // They know what the word is, and may want it read differently from how
  // it is written.
  const tree = render('<Ruby accessibilityLabel="かんじ">漢字<RubyText>かんじ</RubyText></Ruby>')
  assert.equal(announced(tree), 'かんじ')
})

test('the reading is still drawn', () => {
  // Not announced is not the same as not there: ruby exists to be read
  // with the eyes.
  const tree = render('<Ruby>漢字<RubyText>かんじ</RubyText></Ruby>')
  const text = (node: Tree | string | null): string => {
    if (node === null) return ''
    if (typeof node === 'string') return node
    return ((node.children ?? []) as (Tree | string)[]).map(text).join('')
  }
  assert.equal(text(tree), '漢字かんじ')
})
