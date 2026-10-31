// A Native CodeBlock whose lines do not wrap draws its gutter as one column
// beside the lines instead of a cell in every row (#1432), with `@hozo/ui`'s
// own classes from the real generated candidate module, and keeps the cells
// whenever a column would not draw the same. Against the RN stub: that the
// column's lines land on the rows' on a screen is the device run's to show.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openCandidateCache } from '@hozo/compiler'
import type { Tree } from './native-render.ts'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { StyleSheet } = require('react-native')
const root = fileURLToPath(new URL('../../../', import.meta.url))

// `@hozo/ui`'s CodeBlock classes, as it writes them.
const ui = {
  lineClassName: 'px-3 leading-6',
  gutterClassName:
    'select-none border-e border-hozo-border-subtle px-2 leading-6 text-hozo-text-muted',
  insClassName: 'bg-hozo-code-insert-bg text-hozo-code-insert no-underline',
  delClassName: 'bg-hozo-code-delete-bg text-hozo-code-delete no-underline',
}
const taller = 'py-1'

const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.code-gutter-'))
const cache = openCandidateCache()
cache.scanFile(
  'Component.tsx',
  `export const looks = ${JSON.stringify([...Object.values(ui), taller])}`,
  1,
)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule())
const hook = registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@hozo/engine/project'
      ? { url: pathToFileURL(sheet).href, shortCircuit: true }
      : next(specifier, context)
  },
})
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})

const { CodeBlock } = (await import(
  pathToFileURL(path.join(root, 'packages/patterns/src/code-block.native.tsx')).href
)) as { CodeBlock: unknown }

const lines = [
  { tokens: 'const a = 1' },
  { tokens: 'const b = 2', mark: 'ins' },
  { tokens: 'const c = 3', mark: 'ins' },
  { tokens: 'const d = 4' },
  { tokens: 'const e = 5', mark: 'del' },
]

function mount(props: Record<string, unknown>) {
  let tree: { root: Tree } | undefined
  renderer.act(() => {
    tree = renderer.create(
      react.createElement(CodeBlock, {
        lines,
        lineNumbers: { start: 9 },
        style: { fontSize: 12 },
        ...ui,
        ...props,
      }),
    )
  })
  const mounted = tree as { root: Tree }
  const hidden = mounted.root.findAll(
    (node: Tree) =>
      node.type === 'View' &&
      node.props.accessibilityElementsHidden &&
      node.props.importantForAccessibility === 'no-hide-descendants',
  )
  const rows = mounted.root.findAll(
    (node: Tree) => node.type === 'Text' && node.props.accessible === true,
  )
  return { hidden, rows }
}

const textOf = (node: Tree): string =>
  (Array.isArray(node.props.children) ? node.props.children : [node.props.children])
    .map((child: unknown) =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : child && typeof child === 'object' && 'props' in child
          ? textOf(child as Tree)
          : '',
    )
    .join('')

test('unwrapped lines with the UI classes draw one gutter column, line for line', () => {
  const { hidden, rows } = mount({})
  assert.equal(hidden.length, 1, 'one hidden gutter, not one per row')
  assert.equal(rows.length, lines.length)
  const [column] = hidden
  const [text] = column.findAll((node: Tree) => node.type === 'Text' && node.parent === column)
  assert.deepEqual(textOf(text).split('\n'), ['  9', '+ 10', '+ 11', '  12', '− 13'])
  const style = StyleSheet.flatten(text.props.style)
  // Every row is one line of the column high: leading-6 on lines and gutter.
  assert.equal(style.lineHeight, 24)
  for (const row of rows) assert.equal(StyleSheet.flatten(row.props.style).lineHeight, 24)
  // The marked runs are coloured as their cells were, and nothing else is.
  const nested = text.findAll((node: Tree) => node.type === 'Text' && node !== text)
  assert.deepEqual(
    nested.map((node: Tree) => textOf(node)),
    ['+ 10\n+ 11\n', '− 13'],
  )
  assert.ok(StyleSheet.flatten(nested[0].props.style).color)
  // Their backgrounds sit behind their runs, at the rows' offsets.
  const backgrounds = column.findAll(
    (node: Tree) => node.type === 'View' && node.props.style?.backgroundColor,
  )
  assert.deepEqual(
    backgrounds.map((node: Tree) => [node.props.style.top, node.props.style.height]),
    [
      [24, 48],
      [96, 24],
    ],
  )
  // Placed after the rows' start padding (px-3), as each cell was inside its row.
  assert.equal(StyleSheet.flatten(column.props.style).start, 12)
})

test('each row keeps a spacer the width its cell was, so the line text does not move', () => {
  const { hidden, rows } = mount({})
  const width = StyleSheet.flatten(hidden[0].props.style).width
  for (const row of rows) {
    const [spacer] = row.parent.children.filter((node: Tree) => node !== row)
    assert.equal(StyleSheet.flatten(spacer.props.style).width, width)
  }
})

test('wrapped lines, or rows taller than a line, keep a cell in every row', () => {
  for (const props of [
    { wrap: true },
    { lineClassName: `${ui.lineClassName} ${taller}` },
    { gutterStyle: { lineHeight: 20 } },
    { lineStyle: { paddingLeft: 4 } },
  ]) {
    const { hidden } = mount(props)
    assert.equal(hidden.length, lines.length, JSON.stringify(props))
  }
})

test('without marks or numbers there is no gutter at all', () => {
  const { hidden } = mount({ lines: [{ tokens: 'a' }], lineNumbers: false })
  assert.equal(hidden.length, 0)
})
