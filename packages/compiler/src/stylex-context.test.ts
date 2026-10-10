import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { summarizeStylexModule } from './index.ts'
import { StylexModuleCache } from './stylex-project.ts'

const consumer = `import sx from '@stylexjs/stylex'
  import { View } from '@hozo/core'
  import { styles } from './styles'
  import unused from './unused'
  export const App = () => <View {...sx.props(styles.root)} />`

test('the native summary exposes conservative reference evidence without pruning imports', () => {
  const summary = summarizeStylexModule(consumer, 'App.tsx')
  assert.deepEqual(summary.context, {
    parseComplete: true,
    hasStylexImport: true,
    valueImports: ['./styles'],
  })
  assert.deepEqual(summary.imports, ['./styles', './unused', '@hozo/core', '@stylexjs/stylex'])
})

test('extension grammar and syntax recovery cannot certify a complete reference summary', () => {
  assert.equal(summarizeStylexModule(consumer, 'App.ts').context?.parseComplete, false)
  assert.equal(summarizeStylexModule(consumer, 'App.jsx').context?.parseComplete, true)
  assert.equal(
    summarizeStylexModule("import sx from '@stylexjs/stylex'; const broken = (", 'broken.ts')
      .context?.parseComplete,
    false,
  )
})

test('the project cache persists reference evidence and invalidates export-only snapshots', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-stylex-context-'))
  try {
    const file = path.join(root, 'App.tsx')
    const snapshot = path.join(root, 'summary.json')
    const cache = new StylexModuleCache(snapshot)
    cache.scanFile(file, consumer, 123)
    cache.persist()
    const stored = JSON.parse(readFileSync(snapshot, 'utf8'))
    assert.equal(stored.version, 5)
    assert.deepEqual(new StylexModuleCache(snapshot).get(file)?.summary.context, {
      parseComplete: true,
      hasStylexImport: true,
      valueImports: ['./styles'],
    })
    // Same mtime and bytes cannot reuse a schema that never collected these facts.
    stored.version = 4
    delete stored.files[file].summary.context
    writeFileSync(snapshot, JSON.stringify(stored))
    const restored = new StylexModuleCache(snapshot)
    assert.equal(restored.isCurrent(file, 123), false)
    restored.scanFile(file, consumer, 123)
    assert.deepEqual(restored.get(file)?.summary.context?.valueImports, ['./styles'])
    assert.deepEqual(restored.importResolutionRequests(), [
      { importer: file, specifier: './styles' },
      { importer: file, specifier: './unused' },
      { importer: file, specifier: '@hozo/core' },
      { importer: file, specifier: '@stylexjs/stylex' },
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the no-StyleX fast path leaves evidence absent rather than declaring it complete', () => {
  const cache = new StylexModuleCache()
  cache.scanFile(
    '/App.tsx',
    "import { View } from '@hozo/core'; export const App = () => <View />",
    1,
  )
  assert.equal(cache.get('/App.tsx')?.summary.context, undefined)
})
