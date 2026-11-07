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

/** The full-screen press beside the panel, if there is one. */
const backdrop = (root: ReturnType<typeof mount>, onClose: unknown) =>
  root.root.findAll(
    (node: Tree) => node.type === 'Pressable' && node.props.onPress === onClose,
  )[0] as Tree | undefined

test('closeOnBackdropPress puts a press behind the panel that calls onClose', () => {
  let closed = 0
  const onClose = () => {
    closed++
  }
  const off = mount({ onClose, accessibilityLabel: 'Rename' })
  assert.equal(backdrop(off, onClose), undefined, 'on without being asked')
  renderer.act(() => off.unmount())

  const root = mount({ onClose, accessibilityLabel: 'Rename', closeOnBackdropPress: true })
  const press = backdrop(root, onClose)
  assert.ok(press, 'no backdrop press')
  assert.equal(press.props.accessible, false)
  assert.equal(press.props.importantForAccessibility, 'no-hide-descendants')
  // Under the panel, so the panel's presses never reach it.
  // The host Pressable sits inside the stub's component; that and the panel
  // share the scrim.
  const scrim = panel(root).parent as Tree
  const siblings = scrim.children as Tree[]
  assert.ok(siblings.indexOf(press.parent as Tree) >= 0, 'not beside the panel')
  assert.ok(siblings.indexOf(press.parent as Tree) < siblings.indexOf(panel(root)))
  renderer.act(() => (press.props.onPress as () => void)())
  assert.equal(closed, 1)
  renderer.act(() => root.unmount())
})
