// Actual field sources after Metro lowering, with a real generated candidate
// sheet. Stub hosts prove owner/state routing, not OS focus delivery or AT.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, mock, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const theme = await loadTheme('@import "tailwindcss"; @theme { --color-brand: #123456; }', root)
const common =
  'p-2 opacity-100 rounded-none focus:opacity-50 focus:bg-brand focus-visible:outline-2 disabled:opacity-25 read-only:rounded-lg aria-disabled:mt-4 aria-selected:mb-8 aria-checked:ml-8'
const unavailable = 'hover:opacity-25 active:mt-8 not-hover:mb-8'
const inputExpression = (mode: string, extra: string) => {
  const classes = `${common} ${extra}`.trim()
  return mode === 'Literal'
    ? JSON.stringify(`${classes} enabled:px-3 not-focus:mb-2`)
    : mode === 'Opaque'
      ? `{getClasses(${JSON.stringify(classes)})}`
      : `{cx('p-2 opacity-100 rounded-none enabled:px-3 not-focus:mb-2', getClasses(${JSON.stringify(classes.replace('p-2 opacity-100 rounded-none ', ''))}))}`
}
const source = `import {CommandPalette, cx} from '@hozo/core'
export const classes = {command:${JSON.stringify(`${common} aria-expanded:border-2`)}, unavailable:${JSON.stringify(unavailable)}, unavailableMixed:'hover:opacity-30 active:mt-9 not-hover:mb-9'}
${['Literal', 'Opaque', 'Mixed']
  .map(
    (mode) => `export function Command${mode}({open=true,commands,getClasses,extra}) {
 return <CommandPalette open={open} commands={commands} inputClassName=${inputExpression(mode, 'aria-expanded:border-2')}
 inputStyle={extra} itemClassName="hover:text-red-500" />
}`,
  )
  .join('\n')}
export function InputCandidates({value}) {return <CommandPalette commands={[]} inputClassName={value===0 ? classes.command : value===1 ? classes.unavailable : classes.unavailableMixed}/>}`

const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.input-project-'))
const cache = openCandidateCache()
cache.scanFile('Component.tsx', source, 1)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule(theme))
const hook = registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@hozo/engine/project'
      ? { url: pathToFileURL(sheet).href, shortCircuit: true }
      : next(specifier, context)
  },
})
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})
const warning = mock.method(console, 'warn', () => {})
const components = loadNativeModule(source, project, {
  root: project,
  compiler: createCompiler(theme),
})
warning.mock.restore()
components.RawCommand = (
  await import(
    pathToFileURL(path.join(root, 'packages/patterns/src/command-palette.native.tsx')).href
  )
).HozoCommandPalette
const classes = components.classes as Record<string, string>
const flat = (node: Tree) => stub.StyleSheet.flatten(node.props.style)
function mount(name: string, props = {}) {
  let tree: ReturnType<typeof renderer.create>
  renderer.act(() => {
    tree = renderer.create(react.createElement(components[name], props))
  })
  return {
    tree,
    update: (next) => renderer.act(() => tree.update(react.createElement(components[name], next))),
    unmount: () => renderer.act(() => tree.unmount()),
  }
}
function event(node: Tree, name: string) {
  assert.equal(typeof node.props[name], 'function', `${name} is wired to the real field`)
  renderer.act(() => node.props[name]({ nativeEvent: {} }))
}
const commands = [
  { id: 'a', label: 'Alpha', onSelect: () => {} },
  { id: 'b', label: 'Beta', onSelect: () => {} },
]

for (const mode of ['Literal', 'Opaque', 'Mixed'])
  test(`Command input owns ${mode} focus, editable facts and close/query lifecycle`, () => {
    let calls = 0
    const props = {
      commands,
      getClasses: (value: string) => {
        calls++
        return value
      },
    }
    const view = mount(`Command${mode}`, props)
    const field = () => view.tree.root.findByType('TextInput')
    const check = (focused: boolean, override = false) => {
      const style = flat(field())
      assert.equal(style.opacity, override ? 0.8 : focused ? 0.5 : 1)
      assert.equal(style.outlineWidth, focused ? 2 : undefined)
      assert.equal(style.borderRadius, 0, 'the real field is editable, not read-only')
      assert.equal(style.borderWidth ?? style.borderTopWidth, 2, 'the Web combobox is expanded')
      assert.equal(style.marginTop, undefined, 'no invented aria-disabled')
      assert.notEqual(style.marginBottom, 32, 'no borrowed option selection')
      assert.equal(style.marginStart ?? style.marginLeft, undefined, 'not aria-checked')
      if (mode !== 'Opaque')
        assert.equal(style.paddingStart ?? style.paddingLeft, 12, 'enabled is true')
    }
    try {
      const expected = mode === 'Literal' ? 0 : 1
      check(false)
      event(field(), 'onPointerDown')
      event(field(), 'onFocus')
      check(true)
      const option = view.tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Alpha',
      )[0]
      event(option, 'onHoverIn')
      check(true)
      renderer.act(() => field().props.onChangeText('Beta'))
      assert.equal(field().props.value, 'Beta')
      check(true)
      assert.equal(calls, expected, 'field and option events do not re-evaluate authored classes')
      event(field(), 'onBlur')
      check(false)
      event(field(), 'onFocus')
      view.update({ ...props, open: false })
      assert.equal(field().props.value, '')
      check(false)
      view.update({ ...props, open: true, extra: { opacity: 0.8 } })
      event(field(), 'onFocus')
      check(true, true)
      assert.equal(calls, expected * 3)
    } finally {
      view.unmount()
    }
  })

test('uncompiled Command input shares its own focus/form facts', () => {
  const view = mount('RawCommand', { open: true, commands, inputClassName: classes.command })
  const field = () => view.tree.root.findByType('TextInput')
  try {
    assert.equal(flat(field()).opacity, 1)
    event(field(), 'onPressIn')
    event(field(), 'onFocus')
    assert.equal(flat(field()).opacity, 0.5)
    assert.equal(flat(field()).outlineWidth, 2)
    assert.equal(flat(field()).borderWidth ?? flat(field()).borderTopWidth, 2)
    assert.equal(flat(field()).borderRadius, 0)
    event(field(), 'onBlur')
    assert.equal(flat(field()).opacity, 1)
  } finally {
    view.unmount()
  }
})

for (const mode of ['Opaque', 'Mixed'])
  test(`Command ${mode} residuals still diagnose unmeasured pointer predicates`, () => {
    const warn = mock.method(console, 'warn', () => {})
    const view = mount(`Command${mode}`, {
      commands,
      getClasses: () => (mode === 'Opaque' ? classes.unavailable : classes.unavailableMixed),
    })
    try {
      const field = view.tree.root.findByType('TextInput')
      event(field, 'onFocus')
      const style = flat(view.tree.root.findByType('TextInput'))
      assert.equal(style.opacity, mode === 'Opaque' ? undefined : 1)
      assert.equal(style.marginTop, undefined)
      assert.equal(style.marginBottom, undefined)
      assert.ok(
        warn.mock.calls.some((call) => String(call.arguments[0]).includes('does not supply')),
      )
    } finally {
      view.unmount()
      warn.mock.restore()
    }
  })
