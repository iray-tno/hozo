// Every uncompiled fallback that takes children, against what the
// compiler does with the same source.
//
// React Native throws on a bare string inside a `View`: "Text strings must
// be rendered within a `<Text>` component". The Native backend knows this
// and wraps every literal text child it lowers, uniformly -- there is no
// primitive where the answer is different, which is what makes this
// mechanical rather than a judgement about which boxes people put labels
// in. The fallbacks in `@hozo/core` are supposed to behave the way that
// output does, and a dozen of them did not (#295).
//
// So the expectation is not written here. Each case is compiled by the
// real backend and the answer is read off its output, then the fallback is
// rendered and asked the same question. A primitive whose lowering changes
// takes its fallback with it, or this fails.
//
// The list of names is hand-written and guarded: anything `@hozo/core`
// exports that is not in it has to be in `NEEDS_MORE_THAN_CHILDREN`, with
// the reason. That is what keeps a component added later from being
// quietly uncovered, which is how the dozen came to be uncovered at all.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import { compileNative } from '@hozo/compiler'

import './native-render.ts'

const require = createRequire(import.meta.url)

interface Tree {
  type: string
  props: Record<string, unknown>
  children: (Tree | string)[] | null
}

const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { toJSON: () => Tree | null }
  act: (callback: () => void) => void
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}

const core = require('../../core/src/index.native.ts') as Record<string, unknown>

/**
 * Components a bare `<X>label</X>` says nothing about, with the reason.
 *
 * Kept as a list rather than a looser filter, so adding to it is a
 * decision someone writes down -- the same shape as `WEB_ONLY` in
 * `@hozo/core`'s parity test.
 */
const NEEDS_MORE_THAN_CHILDREN = new Map([
  ['FlatList', 'Renders from `data` and `renderItem`; children are not its API.'],
  ['Image', 'Has no children at all.'],
  ['TextInput', 'A field. Its text is `value`.'],
  ['Dialog', 'Mounts a portal and needs an `open`, which is a different test.'],
  ['Combobox', 'Driven by `options`, not children.'],
  ['Listbox', 'Driven by `options`, not children.'],
  ['Menu', 'Driven by `items`, not children.'],
  ['RadioGroup', 'Driven by `options`, not children.'],
  ['Tabs', 'Driven by `tabs`, not children.'],
  ['Toolbar', 'Driven by `items`, not children.'],
  ['Tree', 'Driven by `nodes`, not children.'],
  ['View', "React Native's own, re-exported unchanged. Not Hozo's to wrap."],
  ['Pressable', "React Native's own, re-exported unchanged."],
  ['ScrollView', "React Native's own, re-exported unchanged."],
  ['HozoFlatList', 'The same component under its other published name.'],
  ['HozoCombobox', 'The same component under its other published name.'],
  ['HozoListbox', 'The same component under its other published name.'],
  ['HozoMenu', 'The same component under its other published name.'],
  ['HozoRadioGroup', 'The same component under its other published name.'],
  ['HozoTabs', 'The same component under its other published name.'],
  ['HozoToolbar', 'The same component under its other published name.'],
  ['HozoTree', 'The same component under its other published name.'],
  [
    'Badge',
    'A Text underneath (HozoBadge), so its children are already text and nothing wraps them.',
  ],
  ['Skeleton', 'A placeholder hidden from assistive technology; it holds no label.'],
  [
    'Chip',
    'HozoChip wraps its own label in a Text, and the compiler leaves the label as written so the pattern can name its remove button from the string.',
  ],
  ['HozoChip', 'The same component under its other published name.'],
  ['Avatar', 'Draws a picture or initials from its props; it takes no children.'],
  ['HozoAvatar', 'The same component under its other published name.'],
  ['Pagination', 'Draws numbered controls from its props; it takes no children.'],
  ['HozoPagination', 'The same component under its other published name.'],
  ['Stepper', 'Draws its steps from the `steps` prop; it takes no children.'],
  ['OtpInput', 'An input drawn as cells from its value; it takes no children.'],
  ['CommandPalette', 'Draws its commands from the `commands` prop; it takes no children.'],
  ['ColorPicker', 'Draws swatches, sliders and a field from its value; it takes no children.'],
  ['HozoColorPicker', 'The same component under its other published name.'],
  ['HozoCommandPalette', 'The same component under its other published name.'],
  ['HozoOtpInput', 'The same component under its other published name.'],
  ['HozoStepper', 'The same component under its other published name.'],
  ['Table', 'Holds sections and rows, not text.'],
  ['TableHeader', 'Holds rows, not text.'],
  ['TableBody', 'Holds rows, not text.'],
  ['TableFooter', 'Holds rows, not text.'],
  ['TableRow', 'Holds cells, not text.'],
  [
    'TableCell',
    'HozoTableCell wraps its own text in a Text, and the compiler leaves it as written so the cell can read it to name itself with its column.',
  ],
  ['TableHead', 'The same component as TableCell, told it is a header.'],
  [
    'TableCaption',
    'HozoTableCaption is a Text, so its label is already text and nothing wraps it.',
  ],
  ['HozoTable', 'The same component as Table, under the name compiled output imports.'],
  ['HozoTableSection', 'The component the three sections lower to; holds rows, not text.'],
  ['HozoTableRow', 'The same component as TableRow, under the name compiled output imports.'],
  ['HozoTableCell', 'The same component as TableCell, under the name compiled output imports.'],
  [
    'HozoTableCaption',
    'The same component as TableCaption, under the name compiled output imports.',
  ],
  [
    'Meter',
    "A bar (HozoMeter). Its children are <meter>'s fallback content, which no browser draws.",
  ],
  ['HozoI18nProvider', 'A context provider; it renders its children and no text of its own.'],
  ['Presence', 'Takes one element and renders it, never a label of its own.'],
])

/** The ones a label is an ordinary thing to write inside. */
const TAKES_A_LABEL = [
  'Address',
  'Article',
  'Aside',
  'Button',
  'Code',
  'Del',
  'Description',
  'Details',
  'Emphasis',
  'Fieldset',
  'Figcaption',
  'Figure',
  'Footer',
  'Header',
  'Heading',
  'Legend',
  'Link',
  'List',
  'ListItem',
  'Main',
  'Mark',
  'Nav',
  'NoBreak',
  'Paragraph',
  'Progress',
  'Ruby',
  'RubyText',
  'Search',
  'Section',
  'Separator',
  'Small',
  'Strikethrough',
  'Strong',
  'Sub',
  'Summary',
  'Sup',
  'Term',
  'TermList',
  'Text',
  'Time',
  'Underline',
]

/**
 * Names `@hozo/core` publishes that the compiler does not lower, and why.
 *
 * There is no compiled counterpart to compare these against, so the
 * fallback is the whole answer for them and simply has to be right on its
 * own. Recorded rather than skipped: a name the runtime publishes and the
 * compiler does not know is worth being able to see.
 */
const NOT_LOWERED = new Map([
  [
    'Del',
    '`export const Del = Strikethrough` in `@hozo/typography`. The compiler ' +
      'matches on the tag, so `<Del>` is carried verbatim and the fallback ' +
      'component renders it. ' +
      'This note used to end "only the class compilation is lost", which ' +
      'was wrong: the Native transform then deleted the import that ' +
      'defined it, so on a device it was not rendered at all but a ' +
      'ReferenceError saying the property does not exist. An emulator ' +
      'found that; nothing here could.',
  ],
])

/** Props a component refuses to render without, beyond its children. */
const REQUIRED: Record<string, Record<string, unknown>> = {
  Heading: { level: 2 },
  Link: { href: 'https://example.com' },
  // Closed, it renders only its summary -- which is the point of it,
  // and `disclosure.test.ts` is where that is driven. Open, it is an
  // ordinary box with children.
  Details: { open: true },
  Progress: { value: 50, max: 100 },
  Meter: { value: 0.5 },
}

/** Whether the label ends up inside a `Text`, or `null` if it is not there. */
function wrappedInTree(tree: Tree | string, inText = false): boolean | null {
  if (typeof tree === 'string') return tree === 'label' ? inText : null
  for (const child of tree.children ?? []) {
    const found = wrappedInTree(child, inText || tree.type === 'Text')
    if (found !== null) return found
  }
  return null
}

/** Whether the backend wraps the label, or `null` if it does not lower this. */
function compiledWraps(name: string): boolean | null {
  const props = Object.entries(REQUIRED[name] ?? {})
    .map(([key, value]) => ` ${key}={${JSON.stringify(value)}}`)
    .join('')
  const source = `import { ${name} } from '@hozo/core'\nexport function F() { return <${name}${props}>label</${name}> }`
  const [out] = compileNative(source, 'F.tsx')
  if (out === undefined) return null
  return /<Text[^>]*>label<\/Text>/.test((out as { jsx: string }).jsx)
}

function fallbackWraps(name: string): boolean {
  const component = core[name]
  assert.ok(component, `@hozo/core's native entry does not export ${name}`)
  let root: { toJSON: () => Tree | null } | null = null
  renderer.act(() => {
    root = renderer.create(react.createElement(component, REQUIRED[name] ?? null, 'label'))
  })
  const tree = (root as unknown as { toJSON: () => Tree | null }).toJSON()
  assert.ok(tree, `${name} rendered nothing`)
  const found = wrappedInTree(tree)
  assert.notEqual(found, null, `${name} did not render its label at all`)
  return found === true
}

for (const name of TAKES_A_LABEL) {
  test(`${name} puts a label where the compiler puts it`, () => {
    const compiled = compiledWraps(name)
    if (compiled === null) {
      const why = NOT_LOWERED.get(name)
      assert.ok(
        why,
        `the compiler lowered nothing for ${name}. If that is intended, add it to NOT_LOWERED with the reason.`,
      )
      // No compiled half to agree with, so the only question left is
      // whether this one is safe by itself.
      assert.equal(fallbackWraps(name), true, `${name} is carried verbatim (${why}) and must wrap`)
      return
    }
    assert.equal(
      fallbackWraps(name),
      compiled,
      compiled
        ? 'the compiler wraps this label in a Text and the fallback does not, which throws on a device'
        : 'the fallback wraps a label the compiler leaves bare, so the two platforms differ',
    )
  })
}

test('the names recorded as not lowered are still not lowered', () => {
  // A stale exception reads as a rule. If the compiler learns one of
  // these, the note above it stops being true and this says so.
  for (const [name, why] of NOT_LOWERED) {
    assert.equal(compiledWraps(name), null, `${name} is lowered now, so this note is wrong: ${why}`)
  }
})

test('every component @hozo/core publishes is covered or excused', () => {
  // The guard on the list above. Without it a primitive added later is
  // uncovered by default, which is how the dozen this test exists for
  // came to be uncovered in the first place.
  const uncovered = Object.entries(core)
    .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function')
    .map(([name]) => name)
    .filter((name) => !TAKES_A_LABEL.includes(name) && !NEEDS_MORE_THAN_CHILDREN.has(name))
  assert.deepEqual(
    uncovered,
    [],
    `not in TAKES_A_LABEL and not excused: ${uncovered.join(', ')}. Add it to one, with the reason if the second.`,
  )
})
