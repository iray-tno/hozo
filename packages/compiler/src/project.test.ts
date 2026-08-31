import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { discoverSources, scanProject, writeFileIfChanged } from './project.ts'

function project(): string {
  return mkdtempSync(path.join(tmpdir(), 'hozo-project-'))
}

function source(root: string, relative: string, text = 'export const x = "p-4"'): string {
  const file = path.join(root, relative)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
  return path.resolve(file)
}

test('discovery excludes generated trees and respects gitignore', () => {
  const root = project()
  try {
    const kept = source(root, 'src/kept.ts')
    source(root, 'target/generated.ts')
    source(root, 'temp/checkout.tsx')
    source(root, 'ignored/hidden.ts')
    writeFileSync(path.join(root, '.gitignore'), 'ignored/\n')

    assert.deepEqual(discoverSources(root), [kept])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('content include and exclude narrow a walk deterministically', () => {
  const root = project()
  try {
    const kept = source(root, 'app/kept.tsx')
    source(root, 'app/generated/no.tsx')
    source(root, 'src/no.tsx')

    assert.deepEqual(
      discoverSources(root, { include: ['app/**/*.tsx'], exclude: ['app/generated/**'] }),
      [kept],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a complete scan skips unchanged files and sweeps deleted ones', () => {
  const root = project()
  try {
    const removed = source(root, 'src/removed.ts', 'export const old = "p-4"')
    source(root, 'src/kept.ts', 'export const current = "gap-2"')

    const first = scanProject(root)
    assert.equal(first.stats.scannedFiles, 2)
    assert.equal(first.stats.deletedFiles, 0)

    const warm = scanProject(root)
    assert.equal(warm.stats.scannedFiles, 0)
    assert.equal(warm.stats.skippedFiles, 2)

    rmSync(removed)
    const afterDelete = scanProject(root)
    assert.equal(afterDelete.stats.deletedFiles, 1)
    assert.equal(afterDelete.changed, true)
    assert.doesNotMatch(afterDelete.cache.renderCss(), /p-4/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the project scan persists exported StyleX module summaries', () => {
  const root = project()
  try {
    const styles = source(
      root,
      'src/styles.ts',
      `import * as stylex from '@stylexjs/stylex'
       const local = stylex.create({ root: { padding: 8 }, dynamic: (value) => ({ opacity: value }) })
       export { local as cardStyles }`,
    )
    source(root, 'src/plain.ts', 'export const answer = 42')
    source(root, 'src/unrelated.ts', "export { answer } from './plain'")

    const first = scanProject(root)
    assert.equal(first.stylexModules.size, 1, 'an unrelated barrel must not enter the registry')
    const module = first.stylexModules.get(styles)
    assert.ok(module)
    assert.equal(module.contentHash.length, 64)
    assert.deepEqual(module.summary.exports, [
      {
        exported: 'cardStyles',
        local: 'local',
        kind: 'sheet',
        members: [
          { name: 'dynamic', status: 'function' },
          { name: 'root', status: 'static' },
        ],
      },
    ])
    assert.ok(
      first.stylexModules
        .bindingsFor(path.join(root, 'src', 'Card.tsx'))
        .some((binding) => binding.specifier === './styles' && binding.moduleId === styles),
    )
    assert.equal(first.stylexModules.moduleSources()[0]?.source.includes('stylex.create'), true)

    const warm = scanProject(root)
    assert.equal(warm.stats.scannedFiles, 0)
    assert.deepEqual(warm.stylexModules.modules(), first.stylexModules.modules())

    writeFileSync(
      styles,
      `import * as stylex from '@stylexjs/stylex'
       export const cardStyles = stylex.create({ root: { padding: 16 } })`,
    )
    const changedTime = (Date.now() + 2_000) / 1_000
    utimesSync(styles, changedTime, changedTime)
    const afterEdit = scanProject(root)
    assert.equal(afterEdit.changed, true)
    assert.notEqual(
      afterEdit.stylexModules.get(styles)?.contentHash,
      module.contentHash,
      'a value-only sheet edit must invalidate future parsed-rule output',
    )

    rmSync(styles)
    const afterDelete = scanProject(root)
    assert.equal(afterDelete.stylexModules.size, 0)
    assert.equal(afterDelete.changed, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('bundler-resolved aliases connect StyleX imports and re-export barrels', () => {
  const root = project()
  try {
    const styles = source(
      root,
      'src/styles.ts',
      `import * as stylex from '@stylexjs/stylex'
       export const styles = stylex.create({ root: { padding: 8 } })`,
    )
    const barrel = source(root, 'src/index.ts', `export { styles } from '@theme/styles'`)
    const component = path.join(root, 'src', 'Card.tsx')
    const { stylexModules } = scanProject(root)

    assert.equal(stylexModules.size, 1, 'an unresolved alias barrel stays out of the registry')
    assert.deepEqual(stylexModules.resolutionRequests(), [
      { importer: barrel, specifier: '@theme/styles' },
    ])
    assert.equal(
      stylexModules.setResolvedBindings(barrel, [
        { specifier: '@theme/styles', moduleId: styles },
      ]),
      true,
    )
    assert.equal(stylexModules.size, 2)
    assert.ok(
      stylexModules
        .moduleSources()
        .find((module) => module.id === barrel)
        ?.links.some(
          (binding) => binding.specifier === '@theme/styles' && binding.moduleId === styles,
        ),
    )

    stylexModules.setResolvedBindings(component, [
      { specifier: '@theme', moduleId: barrel },
    ])
    assert.ok(
      stylexModules
        .bindingsFor(component)
        .some((binding) => binding.specifier === '@theme' && binding.moduleId === barrel),
    )
    assert.equal(
      stylexModules.setResolvedBindings(component, [
        { specifier: '@theme', moduleId: barrel },
      ]),
      false,
      'replaying the same resolver answer is not a graph change',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('generated files are not rewritten when their bytes are unchanged', () => {
  const root = project()
  try {
    const file = path.join(root, 'artifact.css')
    assert.equal(writeFileIfChanged(file, '.p-4{}'), true)
    assert.equal(writeFileIfChanged(file, '.p-4{}'), false)
    assert.equal(writeFileIfChanged(file, '.p-8{}'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
