// `backdrop:backdrop-blur-*` on a Native Dialog (#1310): the compiler hands
// the radius over as `hozoBackdropBlur`, and the Dialog draws it through the
// app's backdrop-filter adapter, behind the panel. With no adapter the blur is
// left out and the scrim keeps its colour, rather than the dialog throwing.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { Tree } from './native-render.ts'

import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { configureHozoBackdropFilter } = require('@hozo/engine') as {
  configureHozoBackdropFilter: (adapter: unknown) => () => void
}
const { HozoDialog } = require('../../patterns/src/dialog.native.tsx') as {
  HozoDialog: unknown
}

function BlurStub(props: Record<string, unknown>) {
  return react.createElement('BlurStub', props)
}

const mount = () => {
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(
        HozoDialog,
        {
          open: true,
          onClose: () => {},
          accessibilityLabel: 'Dialog',
          hozoBackdropStyle: [{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }],
          hozoBackdropBlur: 4,
        },
        react.createElement('Inner'),
      ),
    )
  })
  return root as NonNullable<typeof root>
}

test('with an adapter, the scrim draws the blur behind the panel', () => {
  const restore = configureHozoBackdropFilter(BlurStub)
  try {
    const root = mount()
    const [blur] = root.root.findAll((node: Tree) => node.type === 'BlurStub')
    assert.ok(blur, 'no blur layer was drawn')
    assert.equal(blur.props.blurRadius, 4)
    assert.equal(blur.props.pointerEvents, 'none')
    // Behind the panel: the first child of the scrim, before the content.
    const scrim = blur.parent as Tree
    const children = scrim.children as Tree[]
    assert.equal(children[0], blur)
    renderer.act(() => root.unmount())
  } finally {
    restore()
  }
})

test('without an adapter, the scrim keeps its colour and nothing throws', () => {
  const root = mount()
  assert.equal(root.root.findAll((node: Tree) => node.type === 'BlurStub').length, 0)
  const scrim = root.root.findAll(
    (node: Tree) =>
      node.type === 'View' &&
      [node.props.style]
        .flat(Infinity)
        .some(
          (part: unknown) =>
            (part as { backgroundColor?: string } | null)?.backgroundColor === 'rgba(0, 0, 0, 0.5)',
        ),
  )
  assert.equal(scrim.length, 1)
  renderer.act(() => root.unmount())
})
