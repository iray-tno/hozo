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
      `id="${activeId}" role="option" aria-selected="true"[^>]*class="is-active"[^>]*>Create project`,
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
