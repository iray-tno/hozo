// Actual Native source, AOT output and a freshly scanned candidate sheet.
// Delivering stub host events proves owner routing, not OS keyboard/AT delivery.
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
const looks = {
  root: 'p-2 opacity-75 text-[#654321] disabled:opacity-25 aria-selected:mt-8',
  option:
    'p-1 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#123456] active:opacity-75 aria-selected:border-2 aria-selected:text-[#123456] aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 aria-checked:ml-8',
  unavailable: 'hover:mt-9 active:mb-9 focus:ml-9 focus-visible:mr-9',
  expanded: 'aria-expanded:mt-10',
}
const expression = (mode: string, part: 'root' | 'option') => {
  const classes = looks[part]
  const base = part === 'root' ? 'p-2 opacity-75' : 'p-1 border-0 opacity-100 rounded-none'
  return mode === 'Literal'
    ? JSON.stringify(classes)
    : mode === 'Opaque'
      ? `{getClasses(${JSON.stringify(classes)})}`
      : `{cx(${JSON.stringify(base)},getClasses(${JSON.stringify(classes.slice(base.length))}))}`
}
const source = `import {Listbox,cx} from '@hozo/core'
export const classes=${JSON.stringify(looks)}
export function AotExtra({options}) {return <Listbox options={options} optionClassName="enabled:mb-8 not-enabled:mt-2 not-focus:opacity-75 focus:opacity-50"/>}
export function Candidates({value}) {return <Listbox options={[]} className={value?classes.root:''} optionClassName={value?classes.option:classes.unavailable+classes.expanded}/>}
${['Literal', 'Opaque', 'Mixed']
  .map(
    (
      mode,
    ) => `export function ${mode}({options,value,defaultValue,multiple,onValueChange,getClasses,extra}) {
 return <Listbox options={options} value={value} defaultValue={defaultValue} multiple={multiple}
 onValueChange={onValueChange} className=${expression(mode, 'root')}
 optionClassName=${expression(mode, 'option')} optionStyle={extra}/>}`,
  )
  .join('\n')}`
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.listbox-project-'))
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
const compiler = createCompiler()
const components = loadNativeModule(source, project, { root: project, compiler })
components.Raw = (
  await import(pathToFileURL(path.join(root, 'packages/patterns/src/listbox.native.tsx')).href)
).HozoListbox
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
const event = (node, name: string) => {
  assert.equal(typeof node.props[name], 'function', `${name} belongs to the option`)
  renderer.act(() => node.props[name]({ nativeEvent: {} }))
}
function mount(mode: string, props) {
  let tree: ReturnType<typeof renderer.create>
  const render = (next) => react.createElement(components[mode], next)
  renderer.act(() => {
    tree = renderer.create(render(props))
  })
  return {
    tree,
    update: (next) => renderer.act(() => tree.update(render(next))),
    rows: () =>
      tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem',
      ),
    unmount: () => renderer.act(() => tree.unmount()),
  }
}

for (const mode of ['Literal', 'Opaque', 'Mixed', 'Raw']) {
  const props = () => ({
    options,
    getClasses: (v) => v,
    ...(mode === 'Raw' ? { className: looks.root, optionClassName: looks.option } : {}),
  })
  test(`Listbox ${mode} keeps option focus independent of committed single selection`, () => {
    let calls = 0
    const changes: string[] = []
    const view = mount(mode, {
      ...props(),
      defaultValue: 'c',
      onValueChange: (v) => changes.push(v),
      getClasses: (v) => {
        calls++
        return v
      },
    })
    const check = (at: number, selected: boolean, opacity = 1) => {
      const row = view.rows()[at]
      const style = flat(row)
      assert.equal(row.props.accessibilityState.selected, selected)
      assert.equal(style.borderWidth ?? style.borderTopWidth, selected ? 2 : 0)
      assert.equal(style.opacity, opacity)
      assert.equal(style.borderRadius, 8, 'non-editable divs match read-only')
      assert.equal(style.marginTop, undefined, ':disabled does not describe an option div')
      assert.equal(style.marginLeft, undefined, 'selection is not aria-checked')
      assert.equal(flat(row.findByType('Text')).color, selected ? '#123456' : '#654321')
    }
    try {
      const initialCalls = calls
      const owner = view.tree.root.findAllByType('View')[0]
      assert.equal(flat(owner).opacity, 0.75)
      assert.equal(flat(owner).color, undefined, 'root typography is split from its box')
      check(0, false)
      check(1, false, 0.25)
      check(2, true)
      event(view.rows()[0], 'onFocus')
      check(0, false, 0.5)
      assert.equal(flat(view.rows()[0]).outlineWidth, 2)
      check(2, true)
      event(view.rows()[0], 'onHoverIn')
      assert.equal(flat(view.rows()[0]).backgroundColor, '#123456')
      event(view.rows()[0], 'onPressIn')
      check(0, false, 0.75)
      event(view.rows()[0], 'onPressOut')
      event(view.rows()[0], 'onHoverOut')
      event(view.rows()[0], 'onPress')
      assert.deepEqual(changes, ['a'])
      check(0, true, 0.5)
      check(2, false)
      event(view.rows()[1], 'onPress')
      assert.deepEqual(changes, ['a'], 'disabled option blocks activation')
      event(view.rows()[0], 'onBlur')
      check(0, true)
      assert.equal(calls, initialCalls, 'internal events do not re-evaluate authored expressions')
    } finally {
      view.unmount()
    }
  })

  test(`Listbox ${mode} multi selection, controlled updates and keyed reordering preserve owners`, () => {
    const changes: string[][] = []
    const initial = {
      ...props(),
      multiple: true,
      value: ['c'],
      onValueChange: (v) => changes.push(v),
    }
    const view = mount(mode, initial)
    try {
      event(view.rows()[0], 'onFocus')
      event(view.rows()[0], 'onPress')
      assert.deepEqual(changes, [['c', 'a']])
      assert.equal(view.rows()[0].props.accessibilityState.selected, false, 'controlled value wins')
      view.update({ ...initial, value: ['c', 'a'], options: [...options].reverse() })
      assert.equal(flat(view.rows()[2]).opacity, 0.5, 'focus state follows the keyed Alpha option')
      assert.equal(flat(view.rows()[0]).opacity, 1, 'Gamma did not inherit Alpha focus')
      assert.equal(view.rows()[2].props.accessibilityState.selected, true)
      event(view.rows()[2], 'onPress')
      assert.deepEqual(changes.at(-1), ['c'])
    } finally {
      view.unmount()
    }
    const uncontrolled = mount(mode, { ...props(), multiple: true, defaultValue: ['a'] })
    try {
      event(uncontrolled.rows()[2], 'onPress')
      assert.ok(uncontrolled.rows()[0].props.accessibilityState.selected)
      assert.ok(uncontrolled.rows()[2].props.accessibilityState.selected)
      event(uncontrolled.rows()[0], 'onPress')
      assert.equal(uncontrolled.rows()[0].props.accessibilityState.selected, false)
    } finally {
      uncontrolled.unmount()
    }
  })

  test(`Listbox ${mode} explicit option box and text styles remain last`, () => {
    const view = mount(mode, {
      ...props(),
      defaultValue: 'a',
      ...(mode === 'Raw'
        ? { optionStyle: { opacity: 0.9, color: '#fedcba' } }
        : { extra: { opacity: 0.9, color: '#fedcba' } }),
    })
    try {
      event(view.rows()[0], 'onFocus')
      assert.equal(flat(view.rows()[0]).opacity, 0.9)
      assert.equal(flat(view.rows()[0].findByType('Text')).color, '#fedcba')
    } finally {
      view.unmount()
    }
  })
}

test('Listbox keeps broader AOT enabled and negated focus coverage without claiming runtime support', () => {
  const view = mount('AotExtra', { options })
  try {
    assert.equal(flat(view.rows()[0]).opacity, 0.75)
    assert.equal(flat(view.rows()[0]).marginTop, 8)
    assert.equal(flat(view.rows()[0]).marginBottom, undefined)
    assert.equal(
      flat(view.rows()[1]).marginTop,
      8,
      'even disabled options are not enabled controls',
    )
    event(view.rows()[0], 'onFocus')
    assert.equal(flat(view.rows()[0]).opacity, 0.5)
  } finally {
    view.unmount()
  }
})

test('Listbox unobserved root events and unmodeled option facts stay diagnosed', () => {
  for (const [slot, unsupported] of [
    ['className', 'hover:opacity-50'],
    ['className', 'not-focus:opacity-50'],
    ['optionClassName', 'aria-expanded:mt-10'],
  ]) {
    const [native] = compiler.compileNative(
      `import {Listbox} from '@hozo/core';const C=()=> <Listbox options={[]} ${slot}="${unsupported}"/>`,
    )
    assert.ok(
      native.diagnostics.some((d) => d.code.includes('NOT_WIRED')),
      `${slot}/${unsupported}`,
    )
  }
  for (const [slot, classes] of [
    ['className', looks.unavailable],
    ['optionClassName', looks.expanded],
  ]) {
    const warning = mock.method(console, 'warn', () => {})
    const view = mount('Raw', { options, [slot]: classes })
    try {
      assert.ok(
        warning.mock.calls.some((call) => String(call.arguments[0]).includes('does not supply')),
      )
    } finally {
      view.unmount()
      warning.mock.restore()
    }
  }
})
