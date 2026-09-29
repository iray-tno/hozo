/**
 * What the row says, and what it only shows.
 *
 * The marker is a pseudo-element, so none of it reaches the accessibility tree
 * -- which is the point, since `aria-expanded` is already there. The test that
 * matters is therefore a negative one: no glyph in the rendered text, at any
 * depth, in any state.
 *
 * And the one the `branch` field was added for: a closed branch has to be
 * distinguishable from a leaf. `expanded` is false for both, so a renderer given
 * only that draws nothing on a folder nobody has opened -- which is what the
 * demo's tree does, and why its closed branches look like files.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Tree, type TreeNode } from './index.ts'

const NODES: readonly TreeNode[] = [
  {
    id: 'crates',
    label: 'crates',
    children: [
      { id: 'ir', label: 'hozo_ir' },
      { id: 'web', label: 'hozo_web', children: [{ id: 'css', label: 'css.rs' }] },
    ],
  },
  { id: 'readme', label: 'README.md' },
]

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(Tree, {
      nodes: NODES,
      accessibilityLabel: 'Repository',
      defaultExpanded: ['crates'],
      ...props,
    }),
  )

/**
 * Every `role="treeitem"` element, opening tag through to its close.
 *
 * The default row is a span inside a span -- the indentation and then the
 * marker -- so a row ends at `</span></span></div>`.
 */
const rows = (html: string): string[] =>
  [...html.matchAll(/<div[^>]*role="treeitem"[\s\S]*?<\/span><\/span><\/div>/g)].map(
    (found) => found[0],
  )

test('nothing a reader would announce is added to the row', () => {
  const html = render()
  assert.doesNotMatch(html, /[▾▸▴◂►▼]/, 'a glyph here would be part of the accessible name')
  // The text of each row is its label and nothing else.
  assert.match(html, />crates</)
  assert.match(html, />README\.md</)
})

test('a closed branch is drawn differently from a leaf', () => {
  // The whole reason `branch` reaches `renderRow`. `hozo_web` is a branch that
  // is not expanded; `hozo_ir` is a leaf at the same depth.
  const html = render()
  const branch = rows(html).find((row) => row.includes('hozo_web')) ?? ''
  const leaf = rows(html).find((row) => row.includes('hozo_ir')) ?? ''
  assert.ok(branch.length > 0 && leaf.length > 0, 'both rows were found')
  assert.match(branch, /before:-rotate-45/, 'the closed branch has a marker')
  assert.doesNotMatch(leaf, /rotate/, 'the leaf has none')
  // And the branch says so in the tree as well, which is what the marker is a
  // picture of.
  assert.match(branch, /aria-expanded="false"/)
  assert.doesNotMatch(leaf, /aria-expanded/)
})

test('indentation is a literal class per depth', () => {
  // `ps-${level * 4}` is a class name nothing emitted CSS for: Tailwind's
  // scanner and Hozo's compiler both read names without running the code, so a
  // computed one is a row with no indentation at all.
  const html = render()
  const top = rows(html).find((row) => row.includes('crates')) ?? ''
  const second = rows(html).find((row) => row.includes('hozo_ir')) ?? ''
  const third = rows(html).find((row) => row.includes('css.rs')) ?? ''
  assert.match(top, /class="ps-0"/)
  assert.match(second, /class="ps-5"/)
  // The third level is only visible once its parent is open, which is what
  // `visibleRows` decides -- so this also checks the expansion reached here.
  assert.equal(third, '', 'hozo_web is closed, so css.rs is not rendered')
})

test('a caller who passes renderRow owns the row’s inside', () => {
  // The honest bargain: the indentation and the marker are ours *because* we
  // render the row. Replace that and both go, which is why the prop stays in
  // the type rather than being omitted like the class lists.
  const html = render({ renderRow: ({ label }: { label: string }) => `(${label})` })
  assert.match(html, /\(crates\)/)
  assert.doesNotMatch(html, /ps-0/)
})
