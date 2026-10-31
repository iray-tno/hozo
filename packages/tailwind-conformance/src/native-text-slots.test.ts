// Every `ReactNode` slot a Native pattern draws into a box, given a string.
//
// React Native throws on a bare string inside a `View`: "Text strings must be
// rendered within a `<Text>` component". `fallback-text.test.ts` holds
// `@hozo/core`'s components to that for their `children`. The patterns put a
// caller's `ReactNode` into Views of their own as well -- a dialog's body, a
// tooltip's content, a panel -- and a string there is the common case, not an
// edge: the Tooltip demo passes one. Accordion and Tabs drew nothing for one
// until #1252, and Dialog, Drawer, BottomSheet, Popover and Tooltip were left
// with the same gap (#1205).
//
// So each slot is rendered with a string and the string must arrive inside a
// `Text`. The list is guarded like that test's: every `ReactNode` prop
// declared in a `.native.tsx` file of `@hozo/patterns` or `@hozo/form` is
// either a case here or excused with the reason, so a slot added later is
// not quietly uncovered.

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import './native-render.ts'

const require = createRequire(import.meta.url)

interface Tree {
  type: string
  props: Record<string, unknown>
  children: (Tree | string)[] | null
}

const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { toJSON: () => Tree | Tree[] | null; unmount: () => void }
  act: (callback: () => void) => void
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}

/** One component from one Native file, loaded only when its case runs. */
const component = (pkg: string, file: string, name: string) =>
  (require(`../../${pkg}/src/${file}.native.tsx`) as Record<string, unknown>)[name]
const patterns = new Proxy({} as Record<string, unknown>, {
  get: (_, name: string) => {
    const file = PATTERN_FILES[name]
    if (file === undefined) throw new Error(`no file recorded for ${name}`)
    return component('patterns', file, `Hozo${name}`) ?? component('patterns', file, name)
  },
})
const form = new Proxy({} as Record<string, unknown>, {
  get: (_, name: string) => component('form', FORM_FILES[name] ?? '', `Hozo${name}`),
})
const PATTERN_FILES: Record<string, string> = {
  Accordion: 'accordion',
  Alert: 'alert',
  BottomSheet: 'bottom-sheet',
  Chip: 'chip',
  Dialog: 'dialog',
  Drawer: 'drawer',
  Menu: 'menu',
  Popover: 'popover',
  RadioGroup: 'radio',
  Tabs: 'tabs',
  Checkbox: 'toggle',
  Tooltip: 'tooltip',
  Avatar: 'avatar',
  Combobox: 'combobox',
  Listbox: 'listbox',
  Pagination: 'pagination',
}
const FORM_FILES: Record<string, string> = { FileDropzone: 'file-dropzone' }

const LABEL = 'slot label'

/** `file:prop` -> how to render that slot with `LABEL` in it. */
const CASES: Record<string, () => unknown> = {
  'patterns/accordion:header': () =>
    react.createElement(patterns.Accordion, {
      items: [{ id: 'a', header: LABEL, content: 'x' }],
    }),
  'patterns/accordion:content': () =>
    react.createElement(patterns.Accordion, {
      items: [{ id: 'a', header: 'x', content: LABEL }],
      defaultExpanded: 'a',
    }),
  'patterns/alert:children': () => react.createElement(patterns.Alert, null, LABEL),
  'patterns/bottom-sheet:children': () =>
    react.createElement(patterns.BottomSheet, { open: true, accessibilityLabel: 'Sheet' }, LABEL),
  'patterns/chip:children': () => react.createElement(patterns.Chip, null, LABEL),
  'patterns/dialog:children': () =>
    react.createElement(patterns.Dialog, { open: true, accessibilityLabel: 'Dialog' }, LABEL),
  'patterns/drawer:children': () =>
    react.createElement(patterns.Drawer, { open: true, accessibilityLabel: 'Drawer' }, LABEL),
  'patterns/menu:trigger': () => react.createElement(patterns.Menu, { trigger: LABEL, items: [] }),
  'patterns/popover:trigger': () => react.createElement(patterns.Popover, { trigger: LABEL }),
  'patterns/popover:children': () =>
    react.createElement(patterns.Popover, { trigger: 'Open', defaultOpen: true }, LABEL),
  'patterns/radio:label': () =>
    react.createElement(patterns.RadioGroup, {
      options: [{ value: 'a', label: LABEL }],
      accessibilityLabel: 'Group',
    }),
  'patterns/tabs:label': () =>
    react.createElement(patterns.Tabs, { tabs: [{ label: LABEL, content: 'x' }] }),
  'patterns/tabs:content': () =>
    react.createElement(patterns.Tabs, { tabs: [{ label: 'x', content: LABEL }] }),
  'patterns/toggle:children': () => react.createElement(patterns.Checkbox, null, LABEL),
  'patterns/tooltip:content': () =>
    react.createElement(patterns.Tooltip, { content: LABEL, defaultOpen: true }, 'Trigger'),
  'patterns/avatar:fallback': () => react.createElement(patterns.Avatar, { fallback: LABEL }),
  'patterns/chip:removeIcon': () =>
    react.createElement(patterns.Chip, { onRemove: () => {}, removeIcon: LABEL }, 'x'),
  'patterns/combobox:emptyMessage': () =>
    react.createElement(patterns.Combobox, {
      options: [{ value: 'a', label: 'A' }],
      emptyMessage: LABEL,
      accessibilityLabel: 'Combobox',
    }),
  'patterns/combobox:render': () =>
    react.createElement(patterns.Combobox, {
      options: [{ value: 'a', label: 'A', render: LABEL }],
      accessibilityLabel: 'Combobox',
    }),
  'patterns/listbox:render': () =>
    react.createElement(patterns.Listbox, {
      options: [{ value: 'a', label: 'A', render: LABEL }],
      accessibilityLabel: 'Listbox',
    }),
  'patterns/pagination:previousIcon': () =>
    react.createElement(patterns.Pagination, { pageCount: 3, defaultPage: 2, previousIcon: LABEL }),
  'patterns/pagination:nextIcon': () =>
    react.createElement(patterns.Pagination, { pageCount: 3, defaultPage: 2, nextIcon: LABEL }),
  'form/file-dropzone:children': () =>
    react.createElement(form.FileDropzone, { accessibilityLabel: 'Files' }, LABEL),
}

/** What to do after mounting, for a slot drawn only once something opens. */
const AFTER: Record<string, (root: { root: { findByType: (type: string) => Tree } }) => void> = {
  // A combobox opens its list on typing: no match shows the empty message,
  // a match shows the option.
  'patterns/combobox:emptyMessage': (root) =>
    (root.root.findByType('TextInput').props.onChangeText as (text: string) => void)('zzz'),
  'patterns/combobox:render': (root) =>
    (root.root.findByType('TextInput').props.onChangeText as (text: string) => void)('A'),
}

/** Slots this test does not render, with the reason. */
const EXCUSED = new Map([
  ['patterns/pressable:children', 'The shared host; each pattern that hands it text is a case.'],
  ['patterns/scroll-container:children', 'The shared scroller; Dialog is the case through it.'],
  ['patterns/splitter:children', 'A pane of layout around the caller\x27s own elements.'],
  ['form/form:children', 'A form holds fields, not text; it is a box around controls.'],
  ['form/native-select:children', 'The presenter provider: context, not a box.'],
  ['form/calendar:content', 'An internal day cell given text the calendar formats itself.'],
  ['patterns/code-gutter:column', 'Not a slot: the gutter CodeBlock draws, its Text its own.'],
  ['form/field:label', 'Field wraps label, description and error in Text; see field tests.'],
  ['form/field:description', 'As label.'],
  ['form/field:error', 'As label.'],
  ['patterns/pagination:content', 'An internal parameter of a cell, given the page number.'],
])

function inText(tree: Tree | Tree[] | string | null, under = false): boolean[] {
  if (tree === null) return []
  if (typeof tree === 'string') return tree.includes(LABEL) ? [under] : []
  if (Array.isArray(tree)) return tree.flatMap((node) => inText(node, under))
  return (tree.children ?? []).flatMap((child) => inText(child, under || tree.type === 'Text'))
}

for (const [slot, render] of Object.entries(CASES)) {
  test(`${slot} draws a string inside a Text`, () => {
    let root: ReturnType<typeof renderer.create> | undefined
    renderer.act(() => {
      root = renderer.create(render())
    })
    const after = AFTER[slot]
    if (after) renderer.act(() => after(root as never))
    const found = inText((root as NonNullable<typeof root>).toJSON())
    renderer.act(() => root?.unmount())
    assert.ok(found.length > 0, `${slot}: the string was not drawn at all`)
    assert.ok(
      found.every(Boolean),
      `${slot}: the string is bare in a View, which React Native rejects on a device`,
    )
  })
}

test('every ReactNode slot of a Native pattern is a case or excused', () => {
  const root = path.dirname(fileURLToPath(import.meta.url))
  const declared: string[] = []
  for (const pkg of ['patterns', 'form']) {
    const dir = path.join(root, '..', '..', pkg, 'src')
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.native.tsx'))) {
      const source = readFileSync(path.join(dir, file), 'utf8')
      for (const match of source.matchAll(/^\s+(\w+)\??: ReactNode(?:\s|$|,)/gm)) {
        declared.push(`${pkg}/${file.replace('.native.tsx', '')}:${match[1]}`)
      }
    }
  }
  const uncovered = [...new Set(declared)].filter((slot) => !(slot in CASES) && !EXCUSED.has(slot))
  assert.deepEqual(
    uncovered,
    [],
    `not a case and not excused: ${uncovered.join(', ')}. Add a case, or excuse it with the reason.`,
  )
  const stale = [...Object.keys(CASES), ...EXCUSED.keys()].filter(
    (slot) => !declared.includes(slot),
  )
  assert.deepEqual(stale, [], `listed but no longer declared: ${stale.join(', ')}`)
})
