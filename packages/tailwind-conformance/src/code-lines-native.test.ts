// `@hozo/typography`'s Native code lines nest one Text per run of tokens that
// draw the same, not one per token, and none when the whole line draws the
// same (#1431). Against the RN stub; what a run costs on a device is the
// CodeBlock performance probe's to say.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { Tree } from './native-render.ts'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { drawnCodeTokens } = require('../../typography/src/code/model.ts')
const { StyleSheet } = require('react-native')

function line(tokens: unknown, theme?: string) {
  const { CodeLines } = require('../../typography/src/code-lines.native.tsx') as {
    CodeLines: unknown
  }
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(CodeLines, { lines: [{ tokens }], theme }))
  })
  const [outer] = root!.root.findAll((node: Tree) => node.type === 'Text' && node.props.accessible)
  const nested = outer.findAll((node: Tree) => node.type === 'Text' && node !== outer)
  return { outer, nested }
}

test('neighbours that draw the same are one run; any style difference splits them', () => {
  const runs = drawnCodeTokens(
    [
      { text: 'let', color: '#a00' },
      { text: ' ', color: '#333' },
      { text: 'x', color: '#00a' },
      { text: '.', color: '#00a' },
      { text: 'y', color: '#00a', italic: true },
      { text: 'z', color: '#00a', bold: true },
      { text: 'w', color: '#00a', bold: true, underline: true },
      { text: '' },
      { text: ' ', color: '#00a', bold: true },
    ],
    'light',
  )
  assert.deepEqual(
    runs.map((run: { text: string }) => run.text),
    ['let ', 'x.', 'y', 'z', 'w', ' '],
  )
  assert.equal(runs.map((run: { text: string }) => run.text).join(''), 'let x.yzw ')
  assert.equal(runs[0].color, '#a00')
})

test('whitespace takes the colour of what it joins, but not its weight, slant or underline', () => {
  const texts = (tokens: unknown[]) =>
    drawnCodeTokens(tokens, 'light').map((run: { text: string; color?: string }) => [
      run.text,
      run.color,
    ])
  assert.deepEqual(
    texts([
      { text: '  ', color: '#333' },
      { text: 'x', color: '#00a' },
    ]),
    [['  x', '#00a']],
  )
  assert.deepEqual(
    texts([
      { text: ' ', bold: true },
      { text: 'x', color: '#00a' },
    ]),
    [
      [' ', undefined],
      ['x', '#00a'],
    ],
  )
  assert.deepEqual(
    texts([
      { text: 'x', color: '#00a' },
      { text: ' ', color: '#00a', underline: true },
    ]),
    [
      ['x', '#00a'],
      [' ', '#00a'],
    ],
  )
})

test('a theme picks the colour compared, so a run can join in one theme only', () => {
  const tokens = [
    { text: 'a', color: { light: '#111', dark: '#eee' } },
    { text: 'b', color: { light: '#111', dark: '#ddd' } },
  ]
  assert.equal(drawnCodeTokens(tokens, 'light').length, 1)
  assert.equal(drawnCodeTokens(tokens, 'dark').length, 2)
  assert.equal(drawnCodeTokens(tokens, 'sepia')[0].color, '#111')
})

test('a Native line nests a Text per run, and keeps its text and reading', () => {
  const { outer, nested } = line([
    { text: 'const', color: '#a00' },
    { text: ' ', color: '#333' },
    { text: 'x', color: '#00a' },
    { text: ' = ', color: '#00a' },
    { text: '1', color: '#070', bold: true },
  ])
  assert.deepEqual(
    nested.map((node: Tree) => node.props.children),
    ['const ', 'x = ', '1'],
  )
  assert.equal(outer.props.accessibilityLabel, 'const x = 1')
  assert.equal(StyleSheet.flatten(nested[2].props.style).fontWeight, '700')
})

test('a line in one style puts that style on the line and nests nothing', () => {
  const { outer, nested } = line([
    { text: '// a', color: '#666', italic: true },
    { text: ' comment', color: '#666', italic: true },
  ])
  assert.equal(nested.length, 0)
  assert.equal(outer.props.children, '// a comment')
  const style = StyleSheet.flatten(outer.props.style)
  assert.equal(style.color, '#666')
  assert.equal(style.fontStyle, 'italic')
  assert.equal(style.fontFamily, 'monospace')
})

test('an uncoloured line leaves the colour the line was given', () => {
  const { outer, nested } = line('plain text')
  assert.equal(nested.length, 0)
  assert.equal(outer.props.children, 'plain text')
  assert.equal('color' in StyleSheet.flatten(outer.props.style), false)
})
