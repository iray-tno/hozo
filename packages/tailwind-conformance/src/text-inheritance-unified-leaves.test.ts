// Decision 013's two runtime leaves, rendered through the shipped modules with
// mock Native hosts. The compiler route that selects them is tested separately.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import {
  flattenRuntimeStyle as flatten,
  loadTextInheritanceRuntime,
} from './text-inheritance-runtime-host.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const h = React.createElement

function render(element: unknown) {
  let root: { toJSON(): unknown; root: { findAll(p: (n: unknown) => boolean): unknown[] } }
  renderer.act(() => {
    root = renderer.create(element)
  })
  return root!
}
const hosts = (root: ReturnType<typeof render>, type: string) =>
  root.root
    .findAll((node: { type?: unknown }) => node.type === type)
    .map((node: { props: { style?: unknown; testID?: string } }) => ({
      id: node.props.testID,
      style: flatten(node.props.style),
    }))

const runtime = () => loadTextInheritanceRuntime(React.createContext(14))

test('a leaf with no scope above renders its own style unchanged', () => {
  const { HozoInheritedLeafText } = runtime()
  const root = render(
    h(HozoInheritedLeafText, { testID: 'leaf', style: { color: '#123456', fontSize: 12 } }, 'x'),
  )
  assert.deepEqual(hosts(root, 'NativeText'), [
    { id: 'leaf', style: { color: '#123456', fontSize: 12 } },
  ])
})

test('a scope publishes a container frame to a leaf it cannot see, and the leaf’s own values win', () => {
  const { HozoInheritedLeafText, HozoInheritedScope } = runtime()
  const Label = ({ style }: { style?: object }) =>
    h(HozoInheritedLeafText, { testID: 'label', style }, 'label')
  const root = render(
    h(
      HozoInheritedScope,
      { style: { color: '#ff0000', fontSize: 18, lineHeight: 28, padding: 4 } },
      h(
        HozoInheritedScope,
        { style: { fontSize: 24 } },
        h(Label),
        h(Label, { style: { color: '#00ff00' } }),
      ),
    ),
  )
  assert.deepEqual(hosts(root, 'NativeView'), [], 'a scope renders no host')
  assert.deepEqual(hosts(root, 'NativeText'), [
    { id: 'label', style: { fontSize: 24, lineHeight: 28, color: '#ff0000' } },
    { id: 'label', style: { fontSize: 24, lineHeight: 28, color: '#00ff00' } },
  ])
})

test('a leaf keeps values the protocol does not read instead of throwing', () => {
  const { HozoInheritedLeafText, HozoInheritedScope } = runtime()
  const animated = { __animatedInterpolation: {} }
  const root = render(
    h(
      HozoInheritedScope,
      { style: { color: '#ff0000', fontSize: 18 } },
      h(HozoInheritedLeafText, {
        testID: 'own',
        style: [{ fontFamily: 'Inter' }, { color: animated }],
      }),
    ),
  )
  assert.deepEqual(hosts(root, 'NativeText'), [
    { id: 'own', style: { fontSize: 18, fontFamily: 'Inter', color: animated } },
  ])
})

test('an outer leaf with opaque children resets the frame below it, so they inherit natively', () => {
  const { HozoInheritedLeafText, HozoInheritedScope } = runtime()
  const Opaque = () => h(HozoInheritedLeafText, { testID: 'inner' }, 'inner')
  const root = render(
    h(
      HozoInheritedScope,
      { style: { color: '#ff0000', fontSize: 18 } },
      h(
        HozoInheritedLeafText,
        { testID: 'outer', style: { fontSize: 30 }, hozoOpaque: true },
        h(Opaque),
      ),
    ),
  )
  // React Native applies the outer host's values to the inner Text itself; the
  // inner reader must not put the frame from outside back over them.
  assert.deepEqual(hosts(root, 'NativeText'), [
    { id: 'outer', style: { color: '#ff0000', fontSize: 30 } },
    { id: 'inner', style: {} },
  ])
})

test('the leaf stays a label a pressable can style (#876)', () => {
  const { HozoInheritedLeafText } = runtime()
  assert.equal((HozoInheritedLeafText as { hozoLabelText?: boolean }).hozoLabelText, true)
})
