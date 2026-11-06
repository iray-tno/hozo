// What a Native Dialog's own props reach (#1715). The Web half's are asserted
// in `@hozo/patterns` and, for what needs a browser, in storybook-demo.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { Tree } from './native-render.ts'

import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { HozoDialog } = require('../../patterns/src/dialog.native.tsx') as {
  HozoDialog: unknown
}

const mount = (props: Record<string, unknown>) => {
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(
      react.createElement(
        HozoDialog,
        { open: true, onClose: () => {}, ...props },
        react.createElement('Inner'),
      ),
    )
  })
  return root as NonNullable<typeof root>
}

/** The panel: the one element that carries `accessibilityViewIsModal`. */
const panel = (root: ReturnType<typeof mount>) =>
  root.root.findAll((node: Tree) => node.props.accessibilityViewIsModal === true)[0] as Tree

test('accessibilityLabelledBy reaches the panel, with the label kept beside it for iOS', () => {
  const root = mount({ accessibilityLabelledBy: 'rename-title', accessibilityLabel: 'Rename' })
  const props = panel(root).props
  assert.equal(props.accessibilityLabelledBy, 'rename-title')
  assert.equal(props.accessibilityLabel, 'Rename')
  renderer.act(() => root.unmount())
})
