// `CommandPalette` (#152): a dialog holding a combobox whose commands are a
// grouped listbox on the Web, and a full-screen modal of buttons on React
// Native. The Web half renders server-side (no portal); keyboard behaviour on
// the Web is exercised in the Storybook story. The Native half renders
// against the RN stub, not a device.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { renderToStaticMarkup } = require('react-dom/server')
const stub = require('react-native')
const webPalette = require('../../patterns/dist/command-palette.js') as {
  HozoCommandPalette: unknown
}
const flat = (node: { props: Record<string, unknown> } | undefined) =>
  stub.StyleSheet.flatten([node?.props.style].flat(Infinity))

const ran: string[] = []
const COMMANDS = [
  {
    id: 'new',
    label: 'Create project',
    group: 'Actions',
    shortcut: '⌘N',
    onSelect: () => ran.push('new'),
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'Navigation',
    keywords: ['preferences'],
    onSelect: () => ran.push('settings'),
  },
  { id: 'profile', label: 'Profile', group: 'Navigation', onSelect: () => ran.push('profile') },
  {
    id: 'delete',
    label: 'Delete project',
    group: 'Actions',
    disabled: true,
    onSelect: () => ran.push('delete'),
  },
]

test('on the Web: a modal dialog, a combobox pointing at the first command, grouped options', () => {
  const html = renderToStaticMarkup(
    react.createElement(webPalette.HozoCommandPalette, {
      open: true,
      portal: false,
      commands: COMMANDS,
      placeholder: 'Type a command',
      activeItemClassName: 'is-active',
    }),
  )
  assert.match(html, /role="dialog" aria-modal="true" aria-label="Command palette"/, html)
  const input = /<input [^>]*>/.exec(html)?.[0] ?? ''
  assert.match(input, /role="combobox"/)
  assert.match(input, /aria-expanded="true"/)
  assert.match(input, /aria-label="Type a command"/)
  const activeId = /aria-activedescendant="([^"]+)"/.exec(input)?.[1]
  assert.ok(activeId, 'no active descendant')
  assert.match(
    html,
    new RegExp(
      `id="${activeId}" role="option" data-hozo-pressable="" aria-selected="true"[^>]*class="is-active"[^>]*>Create project`,
    ),
  )
  assert.match(
    html,
    /role="group" aria-labelledby="[^"]+"><div id="[^"]+" role="presentation">Actions</,
    html,
  )
  assert.match(
    html,
    /role="group" aria-labelledby="[^"]+"><div id="[^"]+" role="presentation">Navigation</,
    html,
  )
  assert.match(html, /aria-disabled="true"[^>]*>Delete project/, html)
  assert.match(html, /<span aria-hidden="true">⌘N<\/span>/, html)
  // A polite live region for the count. This package resolves `@hozo/behaviors`
  // to its React Native build (`native-render.ts` installs that condition), so
  // here it is the Native `LiveRegion`; the Web one is read in the story.
  assert.match(html, /aria-live="polite"|accessibilityLiveRegion="polite"/, html)
})

test('closed, it renders nothing', () => {
  const html = renderToStaticMarkup(
    react.createElement(webPalette.HozoCommandPalette, {
      open: false,
      portal: false,
      commands: COMMANDS,
    }),
  )
  assert.equal(html, '')
})

const SOURCE = `
  import { CommandPalette } from '@hozo/core'
  export function C({ open, onOpenChange, commands }) {
    return <CommandPalette open={open} onOpenChange={onOpenChange} commands={commands} placeholder="Type a command"
      panelClassName="bg-white text-slate-900" itemClassName="px-3 py-2" activeItemClassName="bg-indigo-50"
      groupHeadingClassName="text-xs" />
  }`

function mount(props: Record<string, unknown>) {
  const { C } = loadNativeModule(SOURCE)
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, { open: true, commands: COMMANDS, ...props }))
  })
  return root
}
const buttons = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll(
    (node: Tree) => node.type === 'Pressable' && node.props.accessibilityRole === 'button',
  )
const field = (root: ReturnType<typeof renderer.create>) =>
  root.root.findAll((node: Tree) => node.type === 'TextInput')[0]

test('on Native: a modal field and a button per command, under header headings', () => {
  const root = mount({})
  assert.equal(field(root).props.autoFocus, true)
  assert.equal(field(root).props.accessibilityLabel, 'Type a command')
  assert.deepEqual(
    buttons(root).map((node: Tree) => node.props.accessibilityLabel),
    ['Create project', 'Delete project', 'Settings', 'Profile'],
  )
  const headers = root.root.findAll(
    (node: Tree) => node.type === 'Text' && node.props.accessibilityRole === 'header',
  )
  assert.deepEqual(
    headers.map((node: Tree) => node.props.children),
    ['Actions', 'Navigation'],
  )
  assert.deepEqual(buttons(root)[1].props.accessibilityState, { disabled: true })
  // The first enabled match is the active one, and the item style reaches every row.
  assert.ok(flat(buttons(root)[0]).backgroundColor, 'activeItemClassName missed the first match')
  assert.equal(flat(buttons(root)[2]).backgroundColor, undefined)
  assert.ok(flat(buttons(root)[2]).paddingTop, 'itemClassName missed a row')
  renderer.act(() => root.unmount())
})

test('on Native: typing narrows and announces, and return runs the best match and closes', () => {
  ran.length = 0
  const announced: string[] = []
  const original = stub.AccessibilityInfo.announceForAccessibility
  stub.AccessibilityInfo.announceForAccessibility = (text: string) => announced.push(text)
  const changes: boolean[] = []
  try {
    const root = mount({ onOpenChange: (open: boolean) => changes.push(open) })
    renderer.act(() => (field(root).props.onChangeText as (v: string) => void)('pref'))
    assert.deepEqual(
      buttons(root).map((node: Tree) => node.props.accessibilityLabel),
      ['Settings'],
    )
    assert.deepEqual(announced, ['1 result'])
    renderer.act(() => (field(root).props.onSubmitEditing as () => void)())
    assert.deepEqual(ran, ['settings'])
    assert.deepEqual(changes, [false])
    renderer.act(() => (field(root).props.onChangeText as (v: string) => void)('zzz'))
    assert.equal(buttons(root).length, 0)
    assert.equal(announced.at(-1), 'No results')
    renderer.act(() => root.unmount())
  } finally {
    stub.AccessibilityInfo.announceForAccessibility = original
  }
})

test('on Native: a press runs that command; a disabled one does not', () => {
  ran.length = 0
  const root = mount({})
  renderer.act(() => (buttons(root)[2].props.onPress as () => void)())
  assert.deepEqual(ran, ['settings'])
  assert.equal(buttons(root)[1].props.disabled, true)
  renderer.act(() => root.unmount())
})

// These Web trees use the test loader's Native headless wrappers. They
// execute the actual palette's state/handlers, not DOM focus or CSS. The
// options' non-focusable markup and mouse-down cancellation are inspected;
// physical focus and pointer delivery still need browser/device evidence.
for (const backend of ['Web', 'Native'] as const) {
  test(`${backend}: pointer targeting, filtering and disabled updates share the highlighted return-key target`, () => {
    const selected: string[] = []
    const changes: boolean[] = []
    const commands = COMMANDS.map((command) => ({
      ...command,
      onSelect: () => selected.push(command.id),
    }))
    const Component = backend === 'Web' ? webPalette.HozoCommandPalette : loadNativeModule(SOURCE).C
    const props = {
      open: true,
      portal: false,
      commands,
      activeItemClassName: 'return-target',
      onOpenChange: (open: boolean) => changes.push(open),
    }
    let root: ReturnType<typeof renderer.create>
    renderer.act(() => {
      root = renderer.create(react.createElement(Component, props))
    })
    const items = () =>
      backend === 'Web'
        ? root.root.findAll((node: Tree) => node.type === 'div' && node.props.role === 'option')
        : buttons(root)
    const item = (label: string) => {
      const found = items().find((node: Tree) =>
        backend === 'Web'
          ? node.props.children?.[0] === label
          : node.props.accessibilityLabel === label,
      )
      assert.ok(found, `${backend} did not mount ${label}`)
      return found
    }
    const input = () =>
      backend === 'Web' ? root.root.findAll((node: Tree) => node.type === 'input')[0] : field(root)
    const active = (node: Tree) =>
      backend === 'Web'
        ? String(node.props.className).includes('return-target')
        : flat(node).backgroundColor !== undefined
    const hover = (node: Tree) =>
      renderer.act(() =>
        (node.props[backend === 'Web' ? 'onMouseMove' : 'onHoverIn'] as () => void)(),
      )
    const submit = () =>
      renderer.act(() => {
        if (backend === 'Web') {
          ;(input().props.onKeyDown as (event: unknown) => void)({
            key: 'Enter',
            preventDefault: () => {},
            nativeEvent: { isComposing: false },
          })
        } else (input().props.onSubmitEditing as () => void)()
      })
    try {
      assert.equal(active(item('Create project')), true)
      hover(item('Settings'))
      assert.equal(active(item('Settings')), true)
      assert.equal(active(item('Create project')), false)
      hover(item('Delete project'))
      assert.equal(active(item('Settings')), true, 'disabled hover does not become the target')
      assert.deepEqual(selected, [], 'a pointer target is not an activation')
      if (backend === 'Web') {
        let prevented = false
        const option = item('Settings')
        ;(option.props.onMouseDown as (event: unknown) => void)({
          preventDefault: () => (prevented = true),
        })
        assert.equal(prevented, true, 'the input keeps focus on mouse down')
        assert.equal(option.props.tabIndex, undefined, 'the option is not a focusable input')
      }
      submit()
      assert.deepEqual(selected, ['settings'])
      assert.deepEqual(changes, [false])

      // The target is still a result, but a new query chooses its best match.
      renderer.act(() => {
        if (backend === 'Web') {
          ;(input().props.onChange as (event: unknown) => void)({ target: { value: 'e' } })
        } else (input().props.onChangeText as (text: string) => void)('e')
      })
      assert.equal(active(item('Create project')), true)
      assert.equal(active(item('Settings')), false)
      hover(item('Settings'))
      renderer.act(() => {
        root.update(
          react.createElement(Component, {
            ...props,
            commands: commands.map((command) =>
              command.id === 'settings' ? { ...command, disabled: true } : command,
            ),
          }),
        )
      })
      assert.equal(active(item('Create project')), true, 'a disabled target is replaced')
      assert.equal(active(item('Settings')), false)
      submit()
      assert.deepEqual(selected, ['settings', 'new'])
      renderer.act(() => {
        root.update(react.createElement(Component, { ...props, open: false }))
      })
      renderer.act(() => root.update(react.createElement(Component, props)))
      assert.equal(input().props.value, '', 'reopening clears the query')
      assert.equal(active(item('Create project')), true, 'reopening clears the pointer target')
    } finally {
      renderer.act(() => root.unmount())
    }
  })
}
