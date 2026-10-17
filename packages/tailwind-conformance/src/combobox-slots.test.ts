// Real Native source and compiled modules with a scanned candidate sheet.
// Stub events establish owner/state routing, not OS keyboard or AT delivery.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, mock, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const input =
  'p-2 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 aria-expanded:border-2 disabled:mt-8 read-only:mb-8 aria-selected:ml-8'
const option =
  'p-1 opacity-100 border-0 rounded-none hover:opacity-50 active:opacity-75 aria-selected:border-2 aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 enabled:mb-8 aria-checked:ml-8'
const list =
  'p-2 text-[#123456] opacity-100 read-only:rounded-lg disabled:opacity-25 enabled:opacity-50 aria-selected:border-8'
const expr = (mode: string, classes: string) =>
  mode === 'Literal'
    ? JSON.stringify(classes)
    : mode === 'Opaque'
      ? `{getClasses(${JSON.stringify(classes)})}`
      : `{cx('${classes.startsWith('p-1 ') ? 'p-1' : 'p-2'} opacity-100',getClasses(${JSON.stringify(classes.replace(/p-[12] opacity-100 /, ''))}))}`
const source = `import {Combobox,cx} from '@hozo/core'
export const classes=${JSON.stringify({ input, option, list, root: 'text-[#654321] read-only:rounded-lg', unavailable: 'hover:mt-9 active:mb-9 not-hover:ml-9', otherUnavailable: 'focus:mt-10 focus-visible:mb-10 not-focus:ml-10' })}
export function RootCandidates({value}) {return <Combobox options={[]} className={value ? classes.root : ''}/>}
${['Literal', 'Opaque', 'Mixed']
  .map(
    (mode) => `export function ${mode}({options,value,onValueChange,getClasses,extra}) {
 return <Combobox options={options} value={value} onValueChange={onValueChange}
 className="text-[#654321] disabled:opacity-25 enabled:opacity-50"
 inputClassName=${expr(mode, input)} listClassName=${expr(mode, list)} optionClassName=${expr(mode, option)}
 inputStyle={extra} optionStyle={extra} />}`,
  )
  .join('\n')}`
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.combobox-project-'))
const cache = openCandidateCache()
cache.scanFile('Component.tsx', source, 1)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule())
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
const components = loadNativeModule(source, project, { root: project, compiler: createCompiler() })
components.Raw = (
  await import(pathToFileURL(path.join(root, 'packages/patterns/src/combobox.native.tsx')).href)
).HozoCombobox
const classes = components.classes as Record<string, string>
const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
]
const flat = (node) =>
  stub.StyleSheet.flatten(
    typeof node.props.style === 'function'
      ? node.props.style({ pressed: false })
      : node.props.style,
  )
const event = (node, name: string, value = { nativeEvent: {} }) => {
  assert.equal(typeof node.props[name], 'function', `${name} is wired to the actual owner`)
  renderer.act(() => node.props[name](value))
}
function mount(name: string, props) {
  let tree: ReturnType<typeof renderer.create>
  renderer.act(() => {
    tree = renderer.create(react.createElement(components[name], props))
  })
  return { tree, unmount: () => renderer.act(() => tree.unmount()) }
}

for (const mode of ['Literal', 'Opaque', 'Mixed', 'Raw'])
  test(`Combobox ${mode} classes follow the input, filtered active option and non-control list`, () => {
    let calls = 0
    const changes: string[] = []
    const view = mount(mode, {
      options,
      value: 'a',
      onValueChange: (v: string) => changes.push(v),
      getClasses: (classes: string) => {
        calls++
        return classes
      },
      ...(mode === 'Raw'
        ? {
            inputClassName: input,
            listClassName: list,
            optionClassName: option,
            className: classes.root,
          }
        : {}),
    })
    const field = () => view.tree.root.findByType('TextInput')
    const rows = () =>
      view.tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem',
      )
    const key = (key: string) => event(field(), 'onKeyPress', { nativeEvent: { key } })
    const query = (text: string) => renderer.act(() => field().props.onChangeText(text))
    try {
      const initialCalls = calls
      assert.equal(field().props.value, 'Alpha')
      assert.equal(field().props.accessibilityState.expanded, false)
      assert.equal(flat(field()).opacity, 1)
      assert.equal(rows().length, 0)
      event(field(), 'onPointerDown')
      event(field(), 'onFocus')
      assert.equal(flat(field()).opacity, 0.5)
      assert.equal(flat(field()).outlineWidth, 2)
      assert.equal(rows().length, 0, 'focus alone does not open the Web popup')
      query('')
      assert.equal(rows().length, 3)
      assert.equal(field().props.accessibilityState.expanded, true)
      assert.equal(flat(field()).borderWidth ?? flat(field()).borderTopWidth, 2)
      assert.ok(
        rows().every((row) => row.props.accessibilityState.selected === false),
        'committed value is not an active option',
      )
      const popup = view.tree.root.findAll(
        (node) => node.type === 'View' && node.props.accessibilityRole === 'list',
      )[0]
      assert.equal(flat(popup).borderRadius, 8)
      assert.equal(flat(popup).opacity, 1, 'a list is neither enabled nor disabled')
      assert.equal(flat(field()).color, '#654321', 'the field inherits root text, not list text')
      const check = (row, selected: boolean, disabled = false) => {
        const style = flat(row)
        assert.equal(style.borderWidth ?? style.borderTopWidth, selected ? 2 : 0)
        assert.equal(style.opacity, disabled ? 0.25 : 1)
        assert.equal(style.borderRadius, 8)
        assert.equal(style.marginTop, undefined, ':disabled never describes the Web option div')
        assert.equal(style.marginBottom, undefined, ':enabled never describes the Web option div')
        const text = row.findByType('Text')
        assert.equal(flat(text).color, '#123456', 'list typography reaches the label')
      }
      check(rows()[0], false)
      check(rows()[1], false, true)
      event(rows()[0], 'onHoverIn')
      assert.equal(flat(rows()[0]).opacity, 0.5)
      assert.equal(
        rows()[0].props.accessibilityState.selected,
        false,
        'hover is not active-descendant selection',
      )
      event(rows()[0], 'onHoverOut')
      event(rows()[0], 'onFocus')
      assert.equal(flat(field()).opacity, 0.5, 'an option does not change input focus')
      key('ArrowDown')
      check(rows()[0], true)
      key('ArrowDown')
      check(rows()[1], true, true)
      key('Enter')
      assert.deepEqual(changes, [], 'a disabled active option cannot commit')
      key('ArrowDown')
      check(rows()[2], true)
      query('Ga')
      assert.equal(rows().length, 1)
      check(rows()[0], false, 'disabled' in options[2])
      key('ArrowUp')
      check(rows()[0], true)
      key('Enter')
      assert.deepEqual(changes, ['c'])
      assert.equal(field().props.value, 'Gamma')
      assert.equal(rows().length, 0)
      assert.equal(flat(field()).opacity, 0.5, 'committing does not borrow option focus')
      key('ArrowDown')
      assert.equal(rows().length, 1)
      event(field(), 'onBlur')
      assert.equal(rows().length, 0)
      assert.equal(flat(field()).opacity, 1)
      event(field(), 'onFocus')
      query('no-match')
      assert.equal(rows().length, 0)
      key('ArrowDown')
      key('Enter')
      assert.deepEqual(changes, ['c'])
      key('Escape')
      assert.equal(field().props.accessibilityState.expanded, false)
      key('Escape')
      assert.equal(field().props.value, '')
      assert.equal(calls, initialCalls, 'owner events never re-evaluate authored class expressions')
    } finally {
      view.unmount()
    }
  })

test('Combobox explicit field and option styles remain last, including inherited text', () => {
  const view = mount('Mixed', {
    options,
    getClasses: (v) => v,
    extra: { opacity: 0.9, color: '#fedcba', borderRadius: 12 },
  })
  try {
    const field = view.tree.root.findByType('TextInput')
    event(field, 'onFocus')
    renderer.act(() => field.props.onChangeText(''))
    assert.equal(flat(view.tree.root.findByType('TextInput')).opacity, 0.9)
    const row = view.tree.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem',
    )[0]
    event(row, 'onHoverIn')
    const current = view.tree.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem',
    )[0]
    assert.equal(flat(current).opacity, 0.9)
    assert.equal(flat(current).borderRadius, 12)
    assert.equal(flat(current.findByType('Text')).color, '#fedcba')
  } finally {
    view.unmount()
  }
})

test('compiled opaque Combobox roots keep constant facts without borrowing input events', () => {
  const warn = mock.method(console, 'warn', () => {})
  const view = mount('RootCandidates', { value: true })
  try {
    const wrapper = view.tree.root.findAllByType('View')[0]
    assert.equal(flat(wrapper).borderRadius, 8)
    assert.equal(flat(wrapper).color, undefined, 'root text is split into its own owner')
    assert.equal(flat(view.tree.root.findByType('TextInput')).color, '#654321')
    assert.equal(warn.mock.calls.length, 0, 'known constant facts are not unresolved state')
  } finally {
    view.unmount()
    warn.mock.restore()
  }
})

test('Combobox unavailable input pointer, option focus and list events remain diagnosed', () => {
  for (const [slot, unsupported] of [
    ['inputClassName', 'hover:opacity-50'],
    ['optionClassName', 'focus:opacity-50'],
    ['listClassName', 'not-focus:opacity-50'],
    ['className', 'hover:opacity-50'],
  ]) {
    const [native] = createCompiler().compileNative(
      `import {Combobox} from '@hozo/core';const C=()=> <Combobox options={[]} ${slot}="${unsupported}"/>`,
    )
    assert.ok(
      native.diagnostics.some((d) => d.code.includes('NOT_WIRED')),
      `${slot} ${unsupported}`,
    )
  }
  for (const [slot, look] of [
    ['inputClassName', classes.unavailable],
    ['optionClassName', classes.otherUnavailable],
  ]) {
    const warning = mock.method(console, 'warn', () => {})
    const view = mount('Raw', { options, [slot]: look })
    try {
      event(view.tree.root.findByType('TextInput'), 'onKeyPress', {
        nativeEvent: { key: 'ArrowDown' },
      })
      assert.ok(
        warning.mock.calls.some((call) => String(call.arguments[0]).includes('does not supply')),
      )
    } finally {
      view.unmount()
      warning.mock.restore()
    }
  }
})
