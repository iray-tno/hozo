// The shared normalizer may open React's transparent containers, not caller
// component bodies. RN hosts here are stand-ins, not device acceptance proof.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import './native-render.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const rn = require('react-native')
const { hozoTextChildren } = require('../../behaviors/src/text-child.native.tsx')

test('text normalization opens keyed fragments and nested arrays without wrapping opaque hosts', () => {
  const style = Object.freeze({ color: '#123456', fontSize: 18 })
  const children = Object.freeze([
    'before',
    React.createElement(
      React.Fragment,
      { key: 'outer' },
      0,
      React.createElement(
        React.Fragment,
        { key: 'inner' },
        Object.freeze([-7, null, false]),
        React.createElement(rn.View, { key: 'opaque', testID: 'opaque', style: { opacity: 0.7 } }),
      ),
    ),
    'after',
  ])
  let tree!: ReturnType<typeof renderer.create>
  renderer.act(() => {
    tree = renderer.create(React.createElement(rn.View, null, hozoTextChildren(children, style)))
  })
  try {
    const texts = () => tree.root.findAllByType('Text')
    assert.deepEqual(
      texts().map((node) => node.props.children),
      ['before', 0, -7, 'after'],
    )
    for (const node of texts()) {
      assert.deepEqual(rn.StyleSheet.flatten(node.props.style), style)
      assert.equal(node.findAll((child) => child.props.testID === 'opaque').length, 0)
    }
    const opaque = tree.root.findAll(
      (node) => node.type === rn.View && node.props.testID === 'opaque',
    )
    assert.equal(opaque.length, 1)
    assert.equal(rn.StyleSheet.flatten(opaque[0].props.style).opacity, 0.7)
    const previous = texts()
    renderer.act(() =>
      tree.update(React.createElement(rn.View, null, hozoTextChildren(children, style))),
    )
    assert.deepEqual(texts(), previous, 'the same keyed containers retain their text receivers')
    assert.ok(Object.isFrozen(children) && Object.isFrozen(style))
  } finally {
    renderer.act(() => tree.unmount())
  }
})

test('normalization never executes opaque components or injects label styling into their props', () => {
  let calls = 0
  function Opaque() {
    calls++
    return React.createElement(rn.Text, { style: { color: '#abcdef' } }, 'owned')
  }
  const input = React.createElement(Opaque, { key: 'caller', marker: 'preserved' })
  const normalized = hozoTextChildren(React.createElement(React.Fragment, null, input), {
    color: '#123456',
  })
  assert.equal(calls, 0, 'normalization must not evaluate a component to discover descendants')
  let tree!: ReturnType<typeof renderer.create>
  renderer.act(() => {
    tree = renderer.create(React.createElement(rn.View, null, normalized))
  })
  try {
    assert.equal(calls, 1)
    const component = tree.root.findByType(Opaque)
    assert.equal(component.props.marker, 'preserved')
    assert.equal(component.props.style, undefined)
    assert.equal(rn.StyleSheet.flatten(tree.root.findByType('Text').props.style).color, '#abcdef')
  } finally {
    renderer.act(() => tree.unmount())
  }
})
