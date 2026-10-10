import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { modularizeHozoImports } from './modular-imports.ts'

// A fixture project shaped like an installed Hozo: `@hozo/core` re-exports
// `@hozo/patterns` by name and `@hozo/semantics` with `*`, and the patterns
// barrel re-exports its modules under the names the facade uses.
const root = mkdtempSync(path.join(tmpdir(), 'hozo-modular-'))
after(() => rmSync(root, { recursive: true, force: true }))

function pkg(name: string, files: Record<string, string>) {
  const dir = path.join(root, 'node_modules', ...name.split('/'))
  mkdirSync(path.join(dir, 'dist'), { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      exports: {
        '.': { 'react-native': { default: './dist/index.native.js' }, default: './dist/index.js' },
      },
    }),
  )
  for (const [file, text] of Object.entries(files))
    writeFileSync(path.join(dir, 'dist', file), text)
}

pkg('@hozo/core', {
  'index.native.js': [
    "export { Dialog, HozoChip as Chip, HozoChip } from '@hozo/patterns';",
    "export * from '@hozo/semantics';",
    "export { Mystery } from 'some-other-package';",
  ].join('\n'),
})
pkg('@hozo/patterns', {
  'index.native.js': [
    "export { Dialog } from './dialog.native.js';",
    "export { HozoChip as Chip, HozoChip, } from './chip.native.js';",
  ].join('\n'),
  'dialog.native.js': 'export function Dialog() {}',
  'chip.native.js': 'export function HozoChip() {}',
})
pkg('@hozo/semantics', {
  'index.native.js': [
    'export function Main() {}',
    "export { HozoTable as Table } from './table.native.js';",
    'const Local = 1;',
    'export { Local as Aliased };',
  ].join('\n'),
  'table.native.js': 'export function HozoTable() {}',
})

const app = path.join(root, 'src', 'App.tsx')
const rewrite = (code: string) => modularizeHozoImports(code, app)

test('a name re-exported through two barrels is imported from the module that declares it', () => {
  const out = rewrite("import { Dialog, Chip } from '@hozo/core'\nexport default Dialog\n")
  assert.match(
    out,
    /^import \{ Dialog \} from "\.\.\/node_modules\/@hozo\/patterns\/dist\/dialog\.native\.js"$/m,
    out,
  )
  assert.match(
    out,
    /^import \{ HozoChip as Chip \} from "\.\.\/node_modules\/@hozo\/patterns\/dist\/chip\.native\.js"$/m,
    out,
  )
  assert.doesNotMatch(out, /from '@hozo\/core'/, out)
})

test('names reached through `export *`, defined in a barrel, or exported from a local binding are followed', () => {
  const out = rewrite("import { Main, Table, Aliased as Thing } from '@hozo/core'\n")
  assert.match(
    out,
    /import \{ Main, Local as Thing \} from "\.\.\/node_modules\/@hozo\/semantics\/dist\/index\.native\.js"/,
    out,
  )
  assert.match(
    out,
    /import \{ HozoTable as Table \} from "\.\.\/node_modules\/@hozo\/semantics\/dist\/table\.native\.js"/,
    out,
  )
})

test('what cannot be followed stays on the barrel, and types are left alone', () => {
  const out = rewrite("import { Dialog, Mystery, Nowhere, type DialogProps } from '@hozo/core'\n")
  assert.match(
    out,
    /import \{ Dialog \} from "\.\.\/node_modules\/@hozo\/patterns\/dist\/dialog\.native\.js"/,
    out,
  )
  assert.match(out, /import \{ Mystery, Nowhere, type DialogProps \} from '@hozo\/core'/, out)
})

test('a file with no Hozo barrel import is returned untouched', () => {
  const code =
    "import { View } from 'react-native'\nimport { HozoFlatList } from '@hozo/core/generated/flat-list'\n"
  assert.equal(rewrite(code), code)
})

test('a namespace import is left on the barrel', () => {
  const code = "import * as Hozo from '@hozo/core'\n"
  assert.equal(rewrite(code), code)
})
