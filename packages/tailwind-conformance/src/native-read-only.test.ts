// These tests exercise generated React trees and the shared prop/ambient
// drivers against the RN stub, not Android/iOS input or keyboard behavior.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compareNativeCandidate } from './native.ts'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const style = (tree: Tree) => stub.StyleSheet.flatten([tree?.props.style].flat(Infinity))

for (const driver of [
  'readOnly={locked}',
  'editable={!locked}',
  'readOnly={locked} editable={false}',
  'readOnly={ready ? locked : false}',
  'readOnly={locked || fallbackLocked}',
]) {
  test(`${driver} updates both read-only directions and breakpoint stacks on the same input`, () => {
    const { C } = loadNativeModule(`
      import {TextInput} from '@hozo/core'
      export function C({locked, ready, fallbackLocked, ...rest}) {
        return <TextInput {...rest} ${driver} accessibilityLabel="Field"
          className="opacity-100 read-only:opacity-50 not-read-only:opacity-75 md:read-only:p-4 md:not-read-only:p-2" />
      }`)
    const previousWidth = stub.Dimensions.get('window').width
    const ref = react.createRef()
    const nativeHost = { focus() {} }
    let root: ReturnType<typeof renderer.create> | undefined
    const onChangeText = () => {}
    const props = (locked: boolean) => ({
      locked,
      ready: true,
      fallbackLocked: false,
      ref,
      onChangeText,
    })
    try {
      renderer.act(() => {
        stub.Dimensions.__hozoSetWindow({ width: 767 })
        root = renderer.create(react.createElement(C, props(false)), {
          createNodeMock: () => nativeHost,
        })
      })
      const tree = () => root!.toJSON() as Tree
      for (const width of [767, 768, 900, 767]) {
        renderer.act(() => stub.Dimensions.__hozoSetWindow({ width }))
        for (const locked of [false, true, false]) {
          renderer.act(() => root!.update(react.createElement(C, props(locked))))
          assert.equal(tree()?.type, 'TextInput')
          assert.equal(style(tree()).opacity, locked ? 0.5 : 0.75)
          for (const edge of ['Top', 'Right', 'Bottom', 'Left']) {
            assert.equal(
              style(tree())[`padding${edge}`],
              width >= 768 ? (locked ? 16 : 8) : undefined,
            )
          }
          assert.equal(ref.current, nativeHost)
          assert.equal(tree()?.props.onChangeText, onChangeText)
          assert.equal(root!.root.findAllByType('TextInput').length, 1)
          assert.equal(tree()?.props.onFocus, undefined, 'read-only needs no interaction handlers')
        }
      }
      // The whole expression must remain grouped with the viewport guard.
      renderer.act(() => {
        stub.Dimensions.__hozoSetWindow({ width: 767 })
        root!.update(
          react.createElement(C, { ...props(false), ready: false, fallbackLocked: true }),
        )
      })
      for (const edge of ['Top', 'Right', 'Bottom', 'Left']) {
        assert.equal(style(tree())[`padding${edge}`], undefined)
      }
      assert.equal(style(tree()).opacity, driver.includes('||') ? 0.5 : 0.75)
    } finally {
      renderer.act(() => {
        root?.unmount()
        stub.Dimensions.__hozoSetWindow({ width: previousWidth })
      })
    }
    assert.equal(ref.current, null)
  })
}

test('an undefined readOnly falls back to editable like the RN TextInput host', () => {
  const { C } = loadNativeModule(`
    import {TextInput} from '@hozo/core'
    export function C({locked, canEdit}) {
      return <TextInput readOnly={locked} editable={canEdit} accessibilityLabel="Field"
        className="opacity-100 read-only:opacity-50 not-read-only:opacity-75" />
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    for (const [locked, canEdit, readOnly] of [
      [undefined, false, true],
      [undefined, true, false],
      [undefined, undefined, false],
      [true, true, true],
      [false, false, false],
      [null, false, false],
    ]) {
      renderer.act(() => {
        root!.update(react.createElement(C, { locked, canEdit }))
      })
      const tree = root!.toJSON() as Tree
      assert.equal(style(tree).opacity, readOnly ? 0.5 : 0.75)
      assert.equal(tree?.props.readOnly, locked)
      assert.equal(tree?.props.editable, canEdit)
    }
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('an undefined editable preserves the input host default instead of meaning read-only', () => {
  const { C } = loadNativeModule(`
    import {TextInput} from '@hozo/core'
    export function C({canEdit}) {
      return <TextInput editable={canEdit} accessibilityLabel="Field"
        className="read-only:opacity-50 not-read-only:opacity-75" />
    }`)
  let root: ReturnType<typeof renderer.create> | undefined
  try {
    renderer.act(() => {
      root = renderer.create(react.createElement(C))
    })
    for (const canEdit of [undefined, false, true, undefined]) {
      renderer.act(() => {
        root!.update(react.createElement(C, { canEdit }))
      })
      const tree = root!.toJSON() as Tree
      assert.equal(style(tree).opacity, canEdit === false ? 0.5 : 0.75)
      assert.equal(tree?.props.editable, canEdit)
    }
  } finally {
    renderer.act(() => root?.unmount())
  }
})

test('Native coverage has an explicit input driver and does not turn a refusal into support', () => {
  for (const candidate of [
    'read-only:p-4',
    'md:read-only:p-4',
    'not-read-only:p-4',
    'md:not-read-only:p-4',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'COVERED', JSON.stringify(result))
    assert.deepEqual(result.restrictedTo, ['TextInput with readOnly'])
  }
  for (const candidate of ['not-invalid:p-4', 'read-only:focus:p-4']) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'REFUSED', JSON.stringify(result))
  }
})
