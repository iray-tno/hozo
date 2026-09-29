/**
 * The two class lists in this package that must stay identical, and the one
 * that must stay different.
 *
 * Identical: the combobox's field and `Input`'s single-line list. They are two
 * literals on purpose -- the pattern renders a plain `<input>` while `Input`
 * wraps the `TextInput` primitive, two elements with two lowerings -- and the
 * cost of that choice is that they can drift. This is where they cannot.
 *
 * Different: `aria-selected` means *highlighted* here and *chosen* in
 * `Listbox`. A combobox whose highlighted row looks chosen tells the reader
 * that arrowing past an option selected it, which is not a style mistake but a
 * lie about state. So the weight change belongs to one of them and not the
 * other, and that is asserted rather than remembered.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Combobox, type ComboboxOption } from './index.ts'

const src = path.join(import.meta.dirname, '..', 'src')
const read = (name: string) => readFileSync(path.join(src, name), 'utf8')

/** A named `const x = '…'` class list, read out of a file's source. */
const list = (file: string, name: string): string => {
  const found = new RegExp(`const ${name} =\\s*\\n?\\s*'([^']*)'`).exec(read(file))
  assert.ok(found, `${name} was not found in ${file}`)
  return found[1] ?? ''
}

const OPTIONS: ComboboxOption<string>[] = [
  { value: 'rust', label: 'Rust' },
  { value: 'ts', label: 'TypeScript' },
]

test('the field is the same list Input uses, to the class', () => {
  assert.equal(list('combobox.tsx', 'field'), list('input.tsx', 'oneLine'))
})

test('a highlight is a tint; a selection is a tint and a weight', () => {
  const highlighted = list('combobox.tsx', 'option')
  const chosen = list('listbox.tsx', 'option')
  assert.match(highlighted, /aria-selected:bg-hozo-accent-subtle/)
  assert.doesNotMatch(highlighted, /aria-selected:font-/, 'a highlight must not read as an answer')
  assert.match(chosen, /aria-selected:font-semibold/)
})

test('the field is a combobox before it is opened, and says so', () => {
  // Closed at rest, so this is the state a page loads in: the popup does not
  // exist yet, and the input carries the role either way.
  const html = renderToStaticMarkup(
    createElement(Combobox, { options: OPTIONS, accessibilityLabel: 'Language' }),
  )
  assert.match(html, /role="combobox"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /class="[^"]*border-hozo-border-strong/)
  assert.doesNotMatch(html, /role="listbox"/)
})
