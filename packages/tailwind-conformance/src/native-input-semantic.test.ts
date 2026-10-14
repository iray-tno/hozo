import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compile } from '@hozo/compiler'
import { nativeTextInputProps } from '../../primitives/src/text-input-props.native.ts'
import { loadNativeModule } from './native-render.ts'
import { buildVariantCatalog, compareVariant } from './variants.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')

test('invalid true attribute variants and stacks match Tailwind, not an invented shorthand', async () => {
  const { cases, vars } = await buildVariantCatalog([
    'aria-[invalid=true]',
    'not-aria-[invalid=true]',
    'focus',
    'md',
  ])
  assert.ok(cases.some((item) => item.candidate === 'aria-[invalid=true]:p-4'))
  for (const item of cases) {
    assert.equal(compareVariant(item, vars).verdict, 'MATCH', item.candidate)
  }
  const [out] = compile(
    `import {TextInput} from '@hozo/core'; const e = <TextInput aria-invalid={bad} className="aria-invalid:border-red-500"/>`,
  )
  assert.ok(out.diagnostics.some((item) => item.code === 'TAILWIND_VARIANT_NOT_SUPPORTED'))
})

test('compiled invalid/disabled/read-only styles follow authored drivers on one native field', () => {
  const { C } = loadNativeModule(`import { TextInput } from '@hozo/core'
    export function C({bad, blocked, locked, canEdit}) {
      return <TextInput accessibilityLabel="Email" aria-invalid={bad} disabled={blocked} readOnly={locked} editable={canEdit}
        accessibilityState={{busy: true}} className="border aria-[invalid=true]:border-red-500 not-aria-[invalid=true]:border-blue-500 disabled:opacity-25 read-only:p-4"/>
    }`)
  let tree: ReturnType<typeof renderer.create>
  renderer.act(() => {
    tree = renderer.create(react.createElement(C))
  })
  const field = () => tree.root.findByType('TextInput')
  const original = field()
  try {
    for (const bad of [true, false, 'true', 'false', 'grammar', 'spelling', undefined]) {
      for (const blocked of [true, false]) {
        renderer.act(() =>
          tree.update(react.createElement(C, { bad, blocked, locked: false, canEdit: true })),
        )
        const style = stub.StyleSheet.flatten(field().props.style)
        assert.equal(style.borderColor, bad === true || bad === 'true' ? '#fb2c36' : '#2b7fff')
        assert.equal(style.opacity, blocked ? 0.25 : undefined)
        assert.equal(style.paddingTop, blocked ? 16 : undefined)
        assert.equal(field().props.editable, !blocked)
        assert.equal(field().props.readOnly, blocked)
        assert.equal(field().props.accessibilityState.busy, true)
        assert.equal(field().props.accessibilityState.disabled, blocked ? true : undefined)
        assert.equal(field(), original)
      }
    }
    assert.equal(tree.root.findAllByType('TextInput').length, 1)
    assert.equal(field().props.onFocus, undefined, 'semantic props do not start focus tracking')
  } finally {
    renderer.act(() => tree.unmount())
  }
})

test('the shared value-level prop adapter preserves readonly vs disabled and never invents invalid announcements', () => {
  const readOnly = { readOnly: true, editable: true, accessibilityState: { busy: true } }
  assert.deepEqual(nativeTextInputProps(readOnly), readOnly)
  assert.deepEqual(nativeTextInputProps({ ...readOnly, disabled: true, 'aria-invalid': true }), {
    readOnly: true,
    editable: false,
    accessibilityState: { busy: true, disabled: true },
    'aria-disabled': true,
  })
})
