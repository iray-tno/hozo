import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gapHelperUses, nativeGapInventory } from './native-gap-inventory.ts'

test('gap inventory follows named imports, aliases and shadowing without evaluating source', () => {
  const uses = gapHelperUses(`
    import { hozoClasses as look } from '@hozo/engine/project'
    import { hozoAuthoredStyle as author } from '@hozo/engine/generated/gap-styles'
    throw new Error('the inventory must not execute project code')
    function local(look) { return look('not a resolver') }
    export const style = [look('gap-x-4'), author(props.style)]
  `)
  assert.deepEqual(
    uses.map(({ helper, kind }) => [helper, kind]),
    [
      ['classes', 'call'],
      ['author', 'call'],
    ],
  )
  assert.match(uses[0].subject, /gap-x-4/)
  assert.match(uses[1].subject, /props.style/)
})

test('namespace dot and constant bracket calls are counted; dynamic access is not assessed', () => {
  const uses = gapHelperUses(`
    import * as project from '@hozo/engine/project'
    import * as gap from '@hozo/engine/generated/gap-styles'
    project.hozoClasses('gap-2')
    project['hozoClasses']('gap-4')
    gap.hozoAuthoredStyle(style)
    project.hozoPreflight('not part of this inventory')
    project[key](value)
  `)
  assert.deepEqual(
    uses.map(({ helper, kind }) => [helper, kind]),
    [
      ['classes', 'call'],
      ['classes', 'call'],
      ['classes', 'opaque'],
      ['author', 'call'],
    ],
  )
})

test('passing or locally aliasing helpers and re-exporting a project helper stays opaque', () => {
  const uses = gapHelperUses(`
    import { hozoClasses } from '@hozo/engine/project'
    const alias = hozoClasses
    consume(hozoClasses)
    export { hozoClasses as other } from '@hozo/engine/project'
    export * from '@hozo/engine/generated/gap-styles'
  `)
  assert.equal(uses.length, 4)
  assert.ok(uses.every((use) => use.kind === 'opaque'))
})

test('type-only imports, comments, strings and unrelated bindings are not runtime uses', () => {
  assert.deepEqual(
    gapHelperUses(`
    import type { hozoClasses } from '@hozo/engine/project'
    import { type hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
    import { hozoClasses as other } from 'unrelated'
    // hozoClasses('gap-4')
    const text = "hozoAuthoredStyle(style)"
    other(text)
  `),
    [],
  )
})

test('the generated core forwarding route and namespace re-exports remain visible', () => {
  const uses = gapHelperUses(`
    import { hozoAuthoredStyle as own } from '@hozo/core/generated/gap-styles'
    own(style)
    export * as look from '@hozo/engine/project'
    export type { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
  `)
  assert.deepEqual(
    uses.map(({ helper, kind }) => [helper, kind]),
    [
      ['author', 'call'],
      ['classes', 'opaque'],
    ],
  )
})

test('a syntax failure is an error, not an empty successful inventory', () => {
  assert.throws(() => gapHelperUses('export const broken = <'), /Unexpected token/)
})

test('discovery includes a new Native package and shared module but not Web halves', () => {
  const fixture = nativeGapInventory(
    fileURLToPath(new URL('./fixtures/native-gap-inventory', import.meta.url)),
  )
  assert.deepEqual(fixture.roots, ['new-widget'])
  assert.equal(fixture.scannedFiles, 3)
  assert.deepEqual(
    fixture.consumers.map(({ file }) => file),
    ['packages/new-widget/src/platform.native.ts', 'packages/new-widget/src/shared.ts'],
  )
  assert.ok(
    fixture.consumers.every(({ uses }) => uses.length === 1 && uses[0].helper === 'classes'),
  )
})

// This ledger guards *consumer* review, not individual style ownership.
// A projection import/call somewhere in a file is not proof that every slot
// projects before flattening, or that its gate/lifetime/value is supported.
const projectionPresent = {
  form: [
    'calendar',
    'date-picker-frame',
    'file-dropzone',
    'form',
    'native-select',
    'picker-button',
    'text-area',
    'time-picker',
  ],
  patterns: [
    'accordion',
    'alert',
    'avatar',
    'bottom-sheet',
    'chip',
    'code-copy',
    'color-picker',
    'combobox',
    'command-palette',
    'dialog',
    'drawer',
    'listbox',
    'menu',
    'otp-input',
    'pagination',
    'popover',
    'radio',
    'slider',
    'splitter',
    'stepper',
    'tabs',
    'toggle',
    'toolbar',
    'tooltip',
    'tree',
  ],
}
const classOnly = [
  'packages/form/src/field.native.tsx',
  'packages/patterns/src/control-indicator.native.tsx',
]
const pending = [
  'packages/patterns/src/code-block.native.tsx',
  // The gutter half of code-block.native.tsx, split out for #1432.
  'packages/patterns/src/code-gutter.native.tsx',
  'packages/typography/src/code-lines.native.tsx',
]
const forwarding = ['packages/core/src/generated/gap-styles.ts']

test('every direct Native/shared project consumer has a bounded review disposition', (context) => {
  const inventory = nativeGapInventory(fileURLToPath(new URL('../../..', import.meta.url)))
  const projectedFiles = Object.entries(projectionPresent).flatMap(([pkg, names]) =>
    names.map(
      (name) => `packages/${pkg}/src/${name}.native.${name === 'date-picker-frame' ? 'ts' : 'tsx'}`,
    ),
  )
  assert.ok(inventory.roots.includes('primitives') && inventory.roots.includes('typography'))
  assert.ok(inventory.scannedFiles > 100, `inventory read only ${inventory.scannedFiles} modules`)
  const actual = inventory.consumers.map(({ file }) => file).sort()
  assert.deepEqual(
    actual,
    [...projectedFiles, ...classOnly, ...pending, ...forwarding].sort(),
    'New or removed resolver/projection consumer: review ownership and update the ledger, not the eligibility gate',
  )
  for (const { file, uses } of inventory.consumers) {
    if (forwarding.includes(file)) {
      assert.deepEqual(
        uses.map(({ helper, kind }) => [helper, kind]),
        [['author', 'opaque']],
        `${file}: a generated forwarding leaf is not a rendering owner`,
      )
      continue
    }
    assert.ok(
      uses.some((use) => use.helper === 'classes' && use.kind === 'call'),
      `${file}: missing resolver control`,
    )
    assert.deepEqual(
      uses.filter((use) => use.kind === 'opaque'),
      [],
      `${file}: opaque helper usage needs explicit review`,
    )
    const authorCalls = uses.filter((use) => use.helper === 'author')
    if (projectedFiles.includes(file))
      assert.ok(authorCalls.length > 0, `${file}: projection was removed`)
    else
      assert.equal(authorCalls.length, 0, `${file}: review the disposition after adding projection`)
  }
  context.diagnostic(
    JSON.stringify({
      roots: inventory.roots,
      scannedFiles: inventory.scannedFiles,
      consumerFiles: actual.length,
      projectionPresent: projectedFiles.length,
      classOnly: classOnly.length,
      pending: pending.length,
      forwarding: forwarding.length,
      calls: inventory.consumers.flatMap(({ uses }) => uses).filter((use) => use.kind === 'call')
        .length,
    }),
  )
})
