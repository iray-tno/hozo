import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const source = readFileSync(path.join(root, 'packages/ui/src/input.tsx'), 'utf8')
const theme = await loadTheme(
  '@import "tailwindcss"; @import "./src/theme.css";',
  path.join(root, 'packages/ui'),
)
const color = (token: string) => theme.colors.find((item) => item.token === token)?.hex
const flat = (node: Tree) => stub.StyleSheet.flatten(node.props.style)

test('the real UI Input keeps static states while caller dynamic classes follow its field and warn for missing facts', () => {
  // An actual generated candidate module, not a second evaluator or copied
  // styles. Keeping it under this package gives its imports normal resolution.
  const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.input-project-'))
  const warn = mock.method(console, 'warn', () => {})
  let tree: ReturnType<typeof renderer.create> | undefined
  try {
    const cache = openCandidateCache()
    cache.scanFile('input.tsx', source, 1)
    cache.scanFile(
      'extra.ts',
      "const classes = 'hover:opacity-25 active:opacity-50 focus:text-hozo-accent read-only:opacity-50'",
      1,
    )
    const sheet = path.join(project, 'node_modules/.hozo')
    mkdirSync(sheet, { recursive: true })
    writeFileSync(path.join(sheet, 'candidates.native.js'), cache.renderNativeModule(theme))
    const { Input } = loadNativeModule(source, project, {
      root: project,
      compiler: createCompiler(theme),
    })
    const calls: unknown[] = []
    const ref = react.createRef()
    const props = {
      ref,
      accessibilityLabel: 'Name',
      value: 'Ada',
      onFocus: (event: unknown) => calls.push(event),
      onBlur: (event: unknown) => calls.push(event),
      onPressIn: (event: unknown) => calls.push(event),
      onChangeText: (value: string) => calls.push(value),
      className: 'hover:opacity-25 active:opacity-50 focus:text-hozo-accent',
    }
    const host = { focus: () => calls.push('imperative focus') }
    renderer.act(() => {
      tree = renderer.create(react.createElement(Input, props), {
        createNodeMock: (node: Tree) => (node.type === 'TextInput' ? host : null),
      })
    })
    const field = () => tree.root.findByType('TextInput')
    const original = field()
    assert.equal(tree.root.findAllByType('TextInput').length, 1)
    assert.equal(tree.root.findAllByType('View').length, 0)
    assert.equal(tree.root.findAllByType('Pressable').length, 0)
    assert.equal(flat(field()).color, color('hozo-text'))
    assert.equal(flat(field()).fontSize, 14)
    assert.equal(flat(field()).outlineWidth, undefined)
    const focus = { nativeEvent: { target: 7 } }
    const press = { nativeEvent: { target: 7 } }
    renderer.act(() => field().props.onFocus(focus))
    assert.equal(flat(field()).outlineWidth, 2)
    assert.equal(flat(field()).outlineOffset, 2)
    assert.equal(flat(field()).outlineColor, color('hozo-focus'))
    assert.equal(flat(field()).color, color('hozo-accent'))
    renderer.act(() => field().props.onPressIn(press))
    assert.equal(flat(field()).outlineWidth, 2)
    assert.equal(flat(field()).opacity, undefined, 'press/hover were not measured')
    const warnings = warn.mock.calls.map((call) => String(call.arguments[0]))
    assert.ok(
      warnings.some(
        (warning) => warning.includes('hover:opacity-25') && warning.includes('does not supply'),
      ),
    )
    assert.ok(
      warnings.some(
        (warning) => warning.includes('active:opacity-50') && warning.includes('does not supply'),
      ),
    )
    assert.ok(!warnings.some((warning) => warning.includes('disabled:bg-hozo-surface-raised')))
    assert.ok(!warnings.some((warning) => warning.includes('focus-visible:outline-2')))
    const count = warn.mock.callCount()
    renderer.act(() =>
      tree.update(
        react.createElement(Input, { ...props, multiline: true, style: { outlineWidth: 8 } }),
      ),
    )
    assert.equal(field(), original)
    assert.equal(field().props.multiline, true)
    assert.equal(flat(field()).outlineWidth, 8, 'authored style stays last')
    renderer.act(() => field().props.onChangeText('Grace'))
    ref.current.focus()
    const blur = { nativeEvent: { target: 7 } }
    renderer.act(() => field().props.onBlur(blur))
    assert.equal(flat(field()).color, color('hozo-text'))
    assert.deepEqual(calls, [focus, press, 'Grace', 'imperative focus', blur])
    for (const invalid of [true, false, 'true', 'false', 'grammar', 'spelling', undefined]) {
      renderer.act(() =>
        tree.update(react.createElement(Input, { ...props, 'aria-invalid': invalid })),
      )
      assert.equal(
        flat(field()).borderColor,
        color(invalid === true || invalid === 'true' ? 'hozo-danger' : 'hozo-border-strong'),
      )
      assert.equal(
        field().props['aria-invalid'],
        undefined,
        'RN has no invalid attribute; do not claim AT mapping',
      )
    }
    for (const [disabled, readOnly, editable, locked] of [
      [true, false, true, true],
      [false, true, true, true],
      [false, false, false, false],
      [false, undefined, false, true],
      [false, undefined, true, false],
    ]) {
      renderer.act(() =>
        tree.update(
          react.createElement(Input, {
            ...props,
            disabled,
            readOnly,
            editable,
            className: 'read-only:opacity-50',
            accessibilityState: { busy: true },
          }),
        ),
      )
      assert.equal(field(), original)
      assert.equal(flat(field()).opacity, locked ? 0.5 : undefined)
      assert.equal(
        flat(field()).backgroundColor,
        color(disabled ? 'hozo-surface-raised' : 'hozo-surface'),
      )
      assert.equal(flat(field()).color, color(disabled ? 'hozo-text-subtle' : 'hozo-text'))
      assert.equal(field().props.accessibilityState.busy, true)
      assert.equal(field().props.accessibilityState.disabled, disabled ? true : undefined)
      assert.equal(field().props.editable, disabled ? false : editable)
      assert.equal(field().props.readOnly, disabled ? true : readOnly)
      assert.equal(field().props.disabled, undefined, 'canonical prop is not leaked to RN')
    }
    // Library classes are static; switching multiline adds no unsupported
    // resize warning and does not repeat the caller's missing-state warnings.
    assert.equal(warn.mock.callCount(), count)
  } finally {
    if (tree) renderer.act(() => tree.unmount())
    warn.mock.restore()
    rmSync(project, { recursive: true, force: true })
  }
})
