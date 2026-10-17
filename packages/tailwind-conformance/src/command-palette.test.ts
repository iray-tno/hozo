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

const STATE_SOURCE = `import { CommandPalette } from '@hozo/core'
export function C({ commands, itemStyle, activeItemStyle, onOpenChange }) {
  return <CommandPalette open commands={commands} onOpenChange={onOpenChange}
    itemClassName="px-2 hover:bg-blue-500 hover:text-white not-hover:text-black active:opacity-50"
    activeItemClassName="border-2 hover:bg-green-500 active:opacity-25"
    itemStyle={itemStyle} activeItemStyle={activeItemStyle} />
}`

test('full Native lowering keeps static shortcut focus variants diagnosed', () => {
  for (const classes of [
    'focus:outline-2',
    'focus-visible:font-bold',
    'not-focus:opacity-50',
    'focus:focus-visible:outline-2',
  ]) {
    assert.throws(
      () =>
        loadNativeModule(`import {CommandPalette} from '@hozo/core'
      export function C() {return <CommandPalette open commands={[]} shortcutClassName="${classes}"/>}`),
      /NOT_WIRED_ON_NATIVE/,
      classes,
    )
  }
})

test('the Web compiler puts the same static pointer classes on options, not the input or shortcut', async () => {
  const { compile } = await import('@hozo/compiler')
  const { renderWeb } = await import('./render.ts')
  const [out] = compile(STATE_SOURCE, 'Commands.tsx')
  assert.ok(out)
  const [rendered] = renderWeb([{ name: 'C', jsx: out.jsx }], {
    HozoCommandPalette: webPalette.HozoCommandPalette,
    commands: COMMANDS,
    onOpenChange: undefined,
    itemStyle: undefined,
    activeItemStyle: undefined,
  })
  const html = rendered?.html ?? ''
  const options = [...html.matchAll(/<div[^>]*role="option"[^>]*class="([^"]+)"/g)]
  assert.equal(options.length, COMMANDS.length)
  assert.equal(options[0]?.[1]?.split(' ').length, 2, 'current option gets both slots')
  assert.equal(options[1]?.[1]?.split(' ').length, 1)
  assert.doesNotMatch(/<input[^>]*>/.exec(html)?.[0] ?? '', /class=/)
  assert.match(html, /<span aria-hidden="true">⌘N<\/span>/)
  for (const className of options[0]?.[1]?.split(' ') ?? []) {
    assert.match(out.css, new RegExp(`\\.${className}:hover`), out.css)
    assert.match(out.css, new RegExp(`\\.${className}:active`), out.css)
  }
})

test('compiled pointer classes reach the item box and real label without turning the target into press state', () => {
  const selected: string[] = []
  const changes: boolean[] = []
  const commands = [
    { id: 'blocked', label: 'Blocked', disabled: true, onSelect: () => selected.push('blocked') },
    { id: 'alpha', label: 'Alpha', onSelect: () => selected.push('alpha') },
    { id: 'beta', label: 'Beta', onSelect: () => selected.push('beta') },
  ]
  const { C } = loadNativeModule(STATE_SOURCE)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(
      react.createElement(C, { commands, onOpenChange: (open: boolean) => changes.push(open) }),
    )
  })
  const item = (label: string) => {
    const node = buttons(root).find((node: Tree) => node.props.accessibilityLabel === label)
    assert.ok(node)
    return node
  }
  const event = (node: Tree, name: string) => {
    assert.equal(typeof node.props[name], 'function', `${name} is not wired`)
    renderer.act(() => (node.props[name] as () => void)())
  }
  try {
    assert.equal(flat(item('Alpha')).borderWidth ?? flat(item('Alpha')).borderTopWidth, 2)
    assert.equal(flat(item('Alpha')).opacity, undefined, 'a target is not a pressed item')
    assert.equal(flat(item('Alpha').findByType('Text')).color, '#000')
    event(item('Beta'), 'onPressIn')
    assert.equal(flat(item('Beta')).opacity, 0.5, 'pressing alone did not select the active slot')
    event(item('Beta'), 'onPressOut')
    assert.deepEqual(selected, [])
    event(item('Beta'), 'onHoverIn')
    assert.equal(flat(item('Beta')).backgroundColor, '#00c950', 'active slot follows the target')
    assert.equal(flat(item('Beta').findByType('Text')).color, '#fff')
    assert.equal(flat(item('Alpha')).backgroundColor, undefined, 'the idle sibling did not hover')
    event(item('Beta'), 'onFocus')
    assert.equal(flat(item('Beta')).opacity, undefined, 'focus is not press or target activation')
    event(item('Beta'), 'onPressIn')
    assert.equal(flat(item('Beta')).opacity, 0.25)
    event(item('Beta'), 'onPressOut')
    event(item('Beta'), 'onHoverOut')
    assert.equal(flat(item('Beta')).backgroundColor, undefined)
    assert.equal(flat(item('Beta').findByType('Text')).color, '#000')
    event(item('Blocked'), 'onHoverIn')
    assert.equal(flat(item('Beta')).borderWidth ?? flat(item('Beta')).borderTopWidth, 2)
    assert.equal(item('Blocked').props.disabled, true)
    renderer.act(() => (field(root).props.onSubmitEditing as () => void)())
    assert.deepEqual(selected, ['beta'])
    assert.deepEqual(changes, [false])
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('compiled command pointer slots preserve explicit item and active-item style precedence', () => {
  const { C } = loadNativeModule(STATE_SOURCE)
  let root: ReturnType<typeof renderer.create>
  renderer.act(() => {
    root = renderer.create(
      react.createElement(C, {
        commands: [{ id: 'a', label: 'Alpha', onSelect: () => {} }],
        itemStyle: { opacity: 0.9, color: 'orange' },
        activeItemStyle: { opacity: 0.8, color: 'purple' },
      }),
    )
  })
  try {
    const item = buttons(root)[0]
    renderer.act(() => (item.props.onHoverIn as () => void)())
    renderer.act(() => (item.props.onPressIn as () => void)())
    assert.equal(flat(item).opacity, 0.8)
    assert.equal(flat(item.findByType('Text')).color, 'purple')
  } finally {
    renderer.act(() => root.unmount())
  }
})

const SEMANTIC_SOURCE = `import { CommandPalette } from '@hozo/core'
export function C({ commands, open = true, onOpenChange, itemStyle, activeItemStyle, shortcutStyle }) {
  return <CommandPalette open={open} commands={commands} onOpenChange={onOpenChange}
    itemClassName="px-2 disabled:ml-8 enabled:mr-8 not-disabled:mt-1 not-enabled:mb-1 aria-selected:bg-blue-500 aria-selected:font-bold not-aria-selected:border-2 aria-disabled:opacity-50 not-aria-disabled:rounded-lg aria-checked:outline-8 not-aria-checked:pt-1 aria-selected:hover:text-white aria-disabled:not-hover:pb-1"
    activeItemClassName="aria-selected:border-4 not-aria-selected:outline-8 not-enabled:pl-1"
    shortcutClassName="text-xs" itemStyle={itemStyle} activeItemStyle={activeItemStyle} shortcutStyle={shortcutStyle} />
}`

test('compiled command option semantics follow target, filtering and availability without borrowing button pseudo-classes', () => {
  const { C } = loadNativeModule(SEMANTIC_SOURCE)
  const selected: string[] = []
  const changes: boolean[] = []
  const commands = ['Blocked', 'Alpha', 'Beta'].map((label) => ({
    id: label,
    label,
    shortcut: label[0],
    disabled: label === 'Blocked',
    onSelect: () => selected.push(label),
  }))
  let root: ReturnType<typeof renderer.create>
  const render = (props = {}) =>
    renderer.act(() => {
      const element = react.createElement(C, {
        commands,
        onOpenChange: (open: boolean) => changes.push(open),
        ...props,
      })
      if (root) root.update(element)
      else root = renderer.create(element)
    })
  const item = (label: string) => {
    const found = buttons(root).find((node: Tree) => node.props.accessibilityLabel === label)
    assert.ok(found, `${label} did not mount`)
    return found
  }
  const event = (node: Tree, name: string) =>
    renderer.act(() => {
      assert.equal(typeof node.props[name], 'function', name)
      ;(node.props[name] as () => void)()
    })
  const check = (current: string | null, disabled: readonly string[] = ['Blocked']) => {
    for (const node of buttons(root)) {
      const active = node.props.accessibilityLabel === current
      const blocked = disabled.includes(node.props.accessibilityLabel as string)
      assert.deepEqual(
        node.props.accessibilityState,
        { disabled: blocked },
        'Native announcements stay button-shaped',
      )
      assert.equal(Boolean(node.props.disabled), blocked)
      assert.equal(flat(node).marginLeft, undefined, 'a Web option is not :disabled')
      assert.equal(flat(node).marginRight, undefined, 'a Web option is not :enabled')
      assert.equal(flat(node).marginTop, 4, 'both negations apply to a div')
      assert.equal(flat(node).marginBottom, 4)
      assert.equal(flat(node).paddingTop, 4, 'no aria-checked attribute')
      assert.equal(
        flat(node).outlineWidth,
        undefined,
        'active-only negative selected rule stays off',
      )
      assert.equal(flat(node).opacity, blocked ? 0.5 : undefined)
      assert.equal(flat(node).borderTopWidth, active ? 4 : 2)
      assert.equal(flat(node).backgroundColor, active ? '#2b7fff' : undefined)
      assert.equal(flat(node).borderRadius, blocked ? undefined : 8)
      const texts = node.findAll((child: Tree) => child.type === 'Text')
      assert.equal(texts.length, 2)
      for (const text of texts)
        assert.equal(
          flat(text).fontWeight,
          active ? '700' : undefined,
          'option typography reaches its shortcut through inheritance',
        )
    }
  }
  try {
    render()
    check('Alpha')
    event(item('Beta'), 'onHoverIn')
    check('Beta')
    assert.equal(flat(item('Beta').findAll((node: Tree) => node.type === 'Text')[1]).color, '#fff')
    event(item('Beta'), 'onHoverOut')
    check('Beta')
    assert.equal(
      flat(item('Beta').findAll((node: Tree) => node.type === 'Text')[1]).color,
      undefined,
    )
    assert.deepEqual(selected, [])
    renderer.act(() => (field(root).props.onSubmitEditing as () => void)())
    assert.deepEqual(selected, ['Beta'])
    assert.deepEqual(changes, [false])
    renderer.act(() => (field(root).props.onChangeText as (text: string) => void)('Alpha'))
    check('Alpha')
    assert.equal(buttons(root).length, 1)
    renderer.act(() => (field(root).props.onChangeText as (text: string) => void)(''))
    render({ commands: commands.map((command) => ({ ...command, disabled: true })) })
    check(null, ['Blocked', 'Alpha', 'Beta'])
    renderer.act(() => (field(root).props.onSubmitEditing as () => void)())
    assert.deepEqual(selected, ['Beta'], 'no target means no activation or closure')
    render({
      commands: commands.map((command) => ({ ...command, disabled: command.label === 'Beta' })),
    })
    check('Blocked', ['Beta'])
    render({ open: false })
    render()
    check('Alpha')
    render({
      itemStyle: { opacity: 0.9, color: '#123456' },
      activeItemStyle: { opacity: 0.8, color: '#654321' },
    })
    assert.equal(flat(item('Alpha')).opacity, 0.8)
    assert.equal(flat(item('Beta')).opacity, 0.9)
    assert.equal(
      flat(item('Alpha').findAll((node: Tree) => node.type === 'Text')[1]).color,
      '#654321',
    )
    render({ shortcutStyle: { color: '#abcdef', fontWeight: '400' } })
    assert.equal(
      flat(item('Alpha').findAll((node: Tree) => node.type === 'Text')[0]).fontWeight,
      '700',
    )
    assert.equal(
      flat(item('Alpha').findAll((node: Tree) => node.type === 'Text')[1]).fontWeight,
      '400',
    )
    assert.equal(
      flat(item('Alpha').findAll((node: Tree) => node.type === 'Text')[1]).color,
      '#abcdef',
    )
  } finally {
    renderer.act(() => root.unmount())
  }
})

test('full lowering resolves decorative owners from their own known non-control facts', () => {
  for (const slot of ['shortcutClassName', 'groupHeadingClassName', 'emptyClassName']) {
    // These owners are not selected options or disabled controls. Their known
    // false facts are supported, not unknown facts that need a diagnostic.
    assert.doesNotThrow(
      () =>
        loadNativeModule(`import { CommandPalette } from '@hozo/core'
      export function C() {return <CommandPalette commands={[]} ${slot}="aria-selected:opacity-50 aria-disabled:mt-4 disabled:opacity-25 read-only:rounded-lg not-aria-selected:border-2" />}`),
      slot,
    )
    for (const classes of [
      'aria-expanded:opacity-50',
      'hover:opacity-50',
      'not-focus:opacity-50',
    ]) {
      assert.throws(
        () =>
          loadNativeModule(`import { CommandPalette } from '@hozo/core'
      export function C() {return <CommandPalette commands={[]} ${slot}="${classes}" />}`),
        /NOT_WIRED_ON_NATIVE/,
        `${slot}: ${classes}`,
      )
    }
  }
})

test('full lowering keeps unknown option semantics and unaudited class owners diagnosed', () => {
  for (const [slot, classes] of [
    ['itemClassName', 'not-aria-expanded:opacity-50'],
    ['activeItemClassName', 'aria-pressed:hover:opacity-50'],
    ['inputClassName', 'aria-pressed:opacity-50'],
    ['listClassName', 'aria-selected:opacity-50'],
    ['panelClassName', 'aria-disabled:opacity-50'],
  ]) {
    assert.throws(
      () =>
        loadNativeModule(`import { CommandPalette } from '@hozo/core'
      export function C() {return <CommandPalette commands={[]} ${slot}="${classes}" />}`),
      /NOT_WIRED_ON_NATIVE/,
      `${slot}: ${classes}`,
    )
  }
})
