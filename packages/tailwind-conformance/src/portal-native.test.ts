import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativePortal } from './portal-native-host.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

test('Native portal registration settles and preserves item identity through updates and removal', () => {
  let hostRenders = 0
  function View(props) {
    // Bound a broken registration feedback loop without a wall-clock timeout
    // or an indefinitely spinning test process.
    if (++hostRenders > 40) throw new Error('Native portal registration did not settle')
    return React.createElement('PortalView', props)
  }
  const { Portal, PortalProvider } = loadNativePortal({ View })
  let mounts = 0,
    cleanups = 0,
    next = 0
  function Label({ id, text }) {
    const [token] = React.useState(() => ++next)
    React.useEffect(() => {
      mounts++
      return () => {
        cleanups++
      }
    }, [])
    return React.createElement('Label', { id, token }, text)
  }
  const scene = (text = 'initial', show = true) =>
    React.createElement(
      PortalProvider,
      null,
      React.createElement('Inline', null, 'Opener'),
      show && React.createElement(Portal, null, React.createElement(Label, { id: 'first', text })),
      React.createElement(
        Portal,
        null,
        React.createElement(Label, { id: 'second', text: 'Sibling' }),
      ),
    )
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(scene())
    })
    const first = tree.root.findByProps({ id: 'first' }).findByType('Label')
    const second = tree.root.findByProps({ id: 'second' }).findByType('Label')
    const token = first.props.token
    assert.equal(mounts, 2)
    assert.equal(cleanups, 0)
    assert.equal(tree.root.findAllByType('PortalView').length, 1)
    renderer.act(() => tree.update(scene('updated')))
    assert.equal(tree.root.findAllByType('Label')[0], first)
    assert.equal(first.props.token, token)
    assert.deepEqual(first.children, ['updated'])
    assert.equal(tree.root.findAllByType('Label')[1], second)
    assert.equal(mounts, 2)
    assert.equal(cleanups, 0)
    renderer.act(() => tree.update(scene('updated', false)))
    assert.deepEqual(
      tree.root.findAllByType('Label').map((node) => node.props.id),
      ['second'],
    )
    assert.equal(tree.root.findByType('Label'), second)
    assert.equal(cleanups, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
  assert.equal(cleanups, 2)
})

test('Native portal without a provider or explicitly disabled stays inline', () => {
  const { Portal, PortalProvider } = loadNativePortal({ View: 'PortalView' })
  for (const provider of [false, true]) {
    let tree: ReturnType<typeof renderer.create>
    const label = React.createElement('Label', { id: 'inline' })
    const child = React.createElement(Portal, { disabled: provider }, label)
    try {
      renderer.act(() => {
        tree = renderer.create(provider ? React.createElement(PortalProvider, null, child) : child)
      })
      assert.equal(tree.root.findAllByType('PortalView').length, 0)
      assert.equal(tree.root.findByType('Label').props.id, 'inline')
    } finally {
      renderer.act(() => tree?.unmount())
    }
  }
})

test('Native portal tolerates StrictMode effect replay and unregisters all items', () => {
  const { Portal, PortalProvider } = loadNativePortal({ View: 'PortalView' })
  let active = 0
  function Label() {
    React.useEffect(() => {
      active++
      return () => {
        active--
      }
    }, [])
    return React.createElement('Label', { id: 'strict' })
  }
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(
            PortalProvider,
            null,
            React.createElement(Portal, null, React.createElement(Label)),
          ),
        ),
      )
    })
    assert.equal(active, 1)
    assert.equal(tree.root.findAllByType('Label').length, 1)
    renderer.act(() =>
      tree.update(React.createElement(React.StrictMode, null, React.createElement(PortalProvider))),
    )
    assert.equal(active, 0)
    assert.equal(tree.root.findAllByType('PortalView').length, 0)
  } finally {
    renderer.act(() => tree?.unmount())
  }
  assert.equal(active, 0)
})
