import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { compareNativeCandidate } from './native.ts'
import { loadNativeModule } from './native-render.ts'
import { buildOracle } from './oracle.ts'
import { renderWeb } from './render.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const source = readFileSync(path.join(root, 'packages/ui/src/input.tsx'), 'utf8')
const theme = await loadTheme(
  '@import "tailwindcss"; @import "./src/theme.css";',
  path.join(root, 'packages/ui'),
)
const compiler = createCompiler(theme)
const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const color = (token: string) => theme.colors.find((entry) => entry.token === token)?.hex

test('actual UI Input owns static state styles on both backends; only the caller is dynamic', () => {
  const native = compiler.compileNative(source)
  const web = compiler.compile(source)
  assert.equal(native.length, 2)
  assert.equal(web.length, 2)
  for (const result of [...native, ...web]) {
    assert.deepEqual(
      result.diagnostics.filter((item) => item.code !== 'DYNAMIC_CLASS_NAME_NOT_RESOLVED'),
      [],
    )
    assert.doesNotMatch(
      result.jsx,
      /aria-\[invalid=true\]:|focus-visible:outline-2|disabled:bg-hozo/,
    )
  }
  assert.match(native[0].styles, /outlineWidth: 2/)
  assert.match(native[0].styles, /cursor: 'auto'/)
  assert.match(native[0].styles, /minHeight: 96/)
  assert.match(native[0].jsx, /hozoClasses\(className,/)
  assert.match(web[0].css, /resize:\s*none/)
  assert.match(web[0].css, /:focus-visible/)
  assert.match(web[0].css, /aria-invalid/)
  assert.doesNotMatch(web[0].css, /not-allowed|resize:vertical/)
  const rendered = renderWeb(
    web.map((result, index) => ({ name: `Input${index}`, jsx: result.jsx })),
    {
      rest: { defaultValue: 'Ada' },
      disabled: false,
      editable: true,
      readOnly: false,
      invalid: true,
      className: 'caller-field',
    },
  )
  assert.match(rendered[0].html, /^<textarea\b/)
  assert.match(rendered[1].html, /^<input\b/)
  for (const result of rendered) {
    assert.match(result.html, /aria-invalid="true"/)
    assert.ok(result.classes.has('caller-field'))
  }
})

test('the static UI Input runs without a project candidate sheet and keeps one field across multiline updates', () => {
  // No scan or generated candidate module: the library's literal must not
  // need a project-wide runtime sheet to obtain its own states.
  // Removing only the *caller* slot lets Metro run with no candidate module;
  // the unmodified source with real caller candidates runs in the runtime test.
  const libraryOnly = source.replace(/\s+className,\n/g, '\n')
  assert.notEqual(libraryOnly, source)
  const { Input } = loadNativeModule(libraryOnly, undefined, { root, compiler })
  let tree: ReturnType<typeof renderer.create>
  renderer.act(() => {
    tree = renderer.create(react.createElement(Input, { accessibilityLabel: 'Name', value: 'Ada' }))
  })
  const field = () => tree.root.findByType('TextInput')
  const style = () => stub.StyleSheet.flatten(field().props.style)
  const original = field()
  try {
    assert.equal(style().color, color('hozo-text'))
    assert.equal(style().fontSize, 14)
    assert.equal(style().minHeight, undefined)
    assert.equal(field().props.placeholderTextColor, color('hozo-text-subtle'))
    renderer.act(() => stub.Appearance.__hozoSetColorScheme('dark'))
    const dark = theme.colors.find((entry) => entry.token === 'hozo-text-subtle')?.dark?.hex
    assert.ok(dark)
    assert.equal(field().props.placeholderTextColor, dark)
    renderer.act(() => stub.Appearance.__hozoSetColorScheme('light'))
    assert.equal(style().outlineWidth, undefined)
    renderer.act(() => field().props.onFocus({ nativeEvent: { target: 1 } }))
    assert.equal(style().outlineWidth, 2)
    assert.equal(style().outlineColor, color('hozo-focus'))
    renderer.act(() =>
      tree.update(
        react.createElement(Input, {
          accessibilityLabel: 'Name',
          value: 'Ada',
          multiline: true,
          disabled: true,
          'aria-invalid': true,
        }),
      ),
    )
    assert.equal(field(), original)
    assert.equal(field().props.multiline, true)
    assert.equal(style().minHeight, 96)
    assert.equal(style().borderColor, color('hozo-danger'))
    assert.equal(style().backgroundColor, color('hozo-surface-raised'))
    assert.equal(style().color, color('hozo-text-subtle'))
    assert.equal(style().cursor, 'auto')
    assert.equal(field().props.editable, false)
    assert.equal(field().props.accessibilityState.disabled, true)
    assert.equal(tree.root.findAllByType('TextInput').length, 1)
    assert.equal(tree.root.findAllByType('View').length, 0)
    assert.equal(tree.root.findAllByType('Pressable').length, 0)
  } finally {
    renderer.act(() => tree.unmount())
    renderer.act(() => stub.Appearance.__hozoSetColorScheme('light'))
  }
})

test('resize-none retains Tailwind Web behavior and is counted as a Native no-op, not new handle support', async () => {
  const candidates = ['resize-none', 'resize', 'resize-x', 'resize-y']
  const oracle = await buildOracle(candidates)
  assert.equal(oracle.rules.get('resize-none')?.replace(/\s/g, ''), 'resize:none;')
  assert.equal(compareNativeCandidate('resize-none').verdict, 'NO_OP')
  for (const candidate of candidates.slice(1)) {
    assert.equal(compareNativeCandidate(candidate).verdict, 'REFUSED')
  }
})
