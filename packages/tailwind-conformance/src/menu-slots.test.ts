// Actual Native source and generated modules, not a stand-in Menu. Stub
// hosts prove style/event routing and Modal.visible, not OS focus or dismissal.
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
  trigger:
    'p-2 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#123456] active:opacity-75 aria-expanded:border-2 read-only:rounded-lg disabled:mt-8 aria-disabled:mb-8 aria-selected:ml-8',
  menu: 'p-2 opacity-100 text-[#123456] read-only:rounded-lg disabled:opacity-25 aria-selected:border-8',
  item: 'p-1 border-0 opacity-100 rounded-none focus:opacity-50 focus-visible:outline-2 hover:bg-[#654321] active:opacity-75 aria-disabled:opacity-25 read-only:rounded-lg disabled:mt-8 aria-selected:ml-8 aria-checked:mr-8',
  unavailable: 'hover:mt-9 active:mb-9 focus:ml-9 focus-visible:mr-9',
  panelUnavailable: 'focus:mr-10',
  expanded: 'aria-expanded:mt-10',
}
const expression = (mode: string, part: 'root' | 'trigger' | 'menu' | 'item') => {
  const classes = looks[part]
  const base =
    part === 'root'
      ? 'p-2 opacity-75'
      : part === 'menu'
        ? 'p-2 opacity-100'
        : `${part === 'item' ? 'p-1' : 'p-2'} border-0 opacity-100 rounded-none`
  return mode === 'Literal'
    ? JSON.stringify(classes)
    : mode === 'Opaque'
      ? `{getClasses(${JSON.stringify(classes)})}`
      : `{cx(${JSON.stringify(base)},getClasses(${JSON.stringify(classes.slice(base.length))}))}`
}
const source = `import {Menu,cx} from '@hozo/core'
export const classes=${JSON.stringify(looks)}
export function Candidates({value}) {return <Menu trigger="Actions" items={[]} className={classes.root} menuClassName={value?classes.menu:classes.unavailable} itemClassName={value?classes.item:classes.expanded}/>}
export function AotExtra({items}) {return <Menu trigger="Actions" items={items} triggerClassName="enabled:px-3 read-only:rounded-lg" itemClassName="enabled:mb-8 not-enabled:mt-2 not-focus:opacity-75 focus:opacity-50"/>}
${['Literal', 'Opaque', 'Mixed']
  .map(
    (mode) => `export function ${mode}({items,getClasses,extra}) {
 return <Menu trigger="Actions" items={items} accessibilityLabel="Letters"
 className=${expression(mode, 'root')} triggerClassName=${expression(mode, 'trigger')}
 menuClassName=${expression(mode, 'menu')} itemClassName=${expression(mode, 'item')}
 triggerStyle={extra} itemStyle={extra}/>}`,
  )
  .join('\n')}`
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.menu-project-'))
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
  await import(pathToFileURL(path.join(root, 'packages/patterns/src/menu.native.tsx')).href)
).HozoMenu
const flat = (node) =>
  stub.StyleSheet.flatten(
    typeof node.props.style === 'function'
      ? node.props.style({ pressed: false })
      : node.props.style,
  )
const event = (node, name: string) => {
  assert.equal(typeof node.props[name], 'function', `${name} is on the actual owner`)
  renderer.act(() => node.props[name]({ nativeEvent: {} }))
}
function mount(mode: string, props) {
  let tree: ReturnType<typeof renderer.create>
  renderer.act(() => {
    tree = renderer.create(react.createElement(components[mode], props))
  })
  return {
    tree,
    trigger: () =>
      tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
      )[0],
    menu: () =>
      tree.root.findAll(
        (node) => node.type === 'View' && node.props.accessibilityRole === 'menu',
      )[0],
    rows: () =>
      tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem',
      ),
    visible: () => tree.root.findByType('Modal').props.visible,
    unmount: () => renderer.act(() => tree.unmount()),
  }
}
for (const mode of ['Literal', 'Opaque', 'Mixed', 'Raw']) {
  const props = () => ({
    getClasses: (v) => v,
    ...(mode === 'Raw'
      ? {
          className: looks.root,
          triggerClassName: looks.trigger,
          menuClassName: looks.menu,
          itemClassName: looks.item,
          trigger: 'Actions',
        }
      : {}),
  })
  test(`Menu ${mode} button expansion and item interaction stay independent`, () => {
    let calls = 0
    const chosen: string[] = []
    const view = mount(mode, {
      ...props(),
      items: [
        { label: 'Alpha', onSelect: () => chosen.push('a') },
        { label: 'Beta', disabled: true, onSelect: () => chosen.push('b') },
        { label: 'Gamma', onSelect: () => chosen.push('c') },
      ],
      getClasses: (v) => {
        calls++
        return v
      },
    })
    try {
      const initialCalls = calls
      assert.equal(view.visible(), false)
      assert.equal(flat(view.tree.root.findAllByType('View')[0]).opacity, 0.75)
      assert.equal(flat(view.trigger().findByType('Text')).color, '#654321')
      assert.equal(flat(view.trigger()).marginTop, undefined)
      assert.equal(flat(view.trigger()).marginBottom, undefined)
      assert.equal(flat(view.trigger()).borderRadius, 8, 'button is non-editable')
      event(view.trigger(), 'onFocus')
      assert.equal(flat(view.trigger()).opacity, 0.5)
      assert.equal(flat(view.trigger()).outlineWidth, 2)
      assert.equal(view.visible(), false, 'focus alone does not open the menu')
      event(view.trigger(), 'onPress')
      assert.equal(view.visible(), true)
      assert.equal(view.trigger().props.accessibilityState.expanded, true)
      assert.equal(flat(view.trigger()).borderWidth ?? flat(view.trigger()).borderTopWidth, 2)
      assert.equal(flat(view.menu()).borderRadius, 8)
      assert.equal(flat(view.menu()).opacity, 1)
      for (const [at, row] of view.rows().entries()) {
        const style = flat(row)
        assert.equal(style.opacity, at === 1 ? 0.25 : 1)
        assert.equal(style.marginTop, undefined, 'disabled announcement is not :disabled')
        assert.equal(style.marginLeft, undefined, 'menu actions are not selected options')
        assert.equal(style.marginRight, undefined, 'menu actions are not checked options')
        assert.equal(style.borderRadius, 8)
        assert.equal(
          flat(row.findByType('Text')).color,
          '#123456',
          'menu typography reaches its labels',
        )
      }
      event(view.rows()[0], 'onFocus')
      assert.equal(flat(view.rows()[0]).opacity, 0.5)
      assert.equal(flat(view.rows()[2]).opacity, 1)
      event(view.rows()[0], 'onHoverIn')
      assert.equal(flat(view.rows()[0]).backgroundColor, '#654321')
      event(view.rows()[0], 'onPressIn')
      assert.equal(flat(view.rows()[0]).opacity, 0.75)
      event(view.rows()[0], 'onPressOut')
      event(view.rows()[0], 'onHoverOut')
      assert.equal(view.trigger().props.accessibilityState.expanded, true)
      event(view.rows()[1], 'onPress')
      assert.deepEqual(chosen, [])
      assert.equal(view.visible(), true, 'disabled item neither acts nor closes')
      event(view.rows()[0], 'onPress')
      assert.deepEqual(chosen, ['a'])
      assert.equal(view.visible(), false)
      assert.equal(view.trigger().props.accessibilityState.expanded, false)
      event(view.trigger(), 'onPress')
      renderer.act(() => view.tree.root.findByType('Modal').props.onRequestClose())
      assert.equal(view.visible(), false)
      event(view.trigger(), 'onPress')
      const scrim = view.tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityElementsHidden,
      )[0]
      event(scrim, 'onPress')
      assert.equal(view.visible(), false)
      assert.equal(calls, initialCalls, 'internal events never rerun authored class expressions')
    } finally {
      view.unmount()
    }
  })

  test(`Menu ${mode} explicit trigger/item text and box styles remain last`, () => {
    const extra = { opacity: 0.9, color: '#fedcba', borderRadius: 12 }
    const view = mount(mode, {
      ...props(),
      items: [{ label: 'Alpha' }],
      ...(mode === 'Raw' ? { triggerStyle: extra, itemStyle: extra } : { extra }),
    })
    try {
      event(view.trigger(), 'onFocus')
      event(view.trigger(), 'onPress')
      event(view.rows()[0], 'onFocus')
      for (const node of [view.trigger(), view.rows()[0]]) {
        assert.equal(flat(node).opacity, 0.9)
        assert.equal(flat(node).borderRadius, 12)
        assert.equal(flat(node.findByType('Text')).color, '#fedcba')
      }
    } finally {
      view.unmount()
    }
  })
}
test('Menu retains broader AOT enabled/negated focus coverage separately from candidate vocabulary', () => {
  const view = mount('AotExtra', { items: [{ label: 'Alpha' }, { label: 'Beta', disabled: true }] })
  try {
    assert.equal(flat(view.trigger()).paddingStart, 12)
    assert.equal(flat(view.trigger()).paddingEnd, 12)
    assert.equal(flat(view.trigger()).borderRadius, 8)
    event(view.trigger(), 'onPress')
    assert.equal(flat(view.rows()[0]).opacity, 0.75)
    assert.equal(flat(view.rows()[1]).marginTop, 8)
    assert.equal(flat(view.rows()[1]).marginBottom, undefined)
    event(view.rows()[0], 'onFocus')
    assert.equal(flat(view.rows()[0]).opacity, 0.5)
  } finally {
    view.unmount()
  }
})
test('Menu root/panel events and unmodeled item expansion remain diagnostics', () => {
  for (const [slot, unsupported] of [
    ['className', 'not-focus:opacity-50'],
    ['menuClassName', 'hover:opacity-50'],
    ['itemClassName', looks.expanded],
  ]) {
    const [native] = compiler.compileNative(
      `import {Menu} from '@hozo/core';const C=()=> <Menu trigger="Actions" items={[]} ${slot}="${unsupported}"/>`,
    )
    assert.ok(
      native.diagnostics.some((d) => d.code.includes('NOT_WIRED')),
      `${slot}/${unsupported}`,
    )
  }
  // Each probe has its own candidate: the resolver intentionally warns once
  // per candidate, not once for every component instance using it.
  for (const [slot, classes] of [
    ['className', looks.unavailable],
    ['menuClassName', looks.panelUnavailable],
    ['itemClassName', looks.expanded],
  ]) {
    const warning = mock.method(console, 'warn', () => {})
    const view = mount('Raw', { trigger: 'Actions', items: [{ label: 'Alpha' }], [slot]: classes })
    try {
      event(view.trigger(), 'onPress')
      assert.ok(
        warning.mock.calls.some((call) => String(call.arguments[0]).includes('does not supply')),
        slot,
      )
    } finally {
      view.unmount()
      warning.mock.restore()
    }
  }
})
