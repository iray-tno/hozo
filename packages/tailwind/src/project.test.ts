import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { loadProjectClassOrder, loadProjectTheme } from './project.ts'

test('discovers the same conventional CSS entry for every bundler', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-project-theme-'))
  try {
    writeFileSync(
      path.join(root, 'global.css'),
      `@import "tailwindcss";\n@theme { --color-brand: oklch(62% 0.19 259); }\n`,
    )

    const theme = await loadProjectTheme(root)
    assert.equal(theme?.colors.find((color) => color.token === 'brand')?.hex, '#3581f6')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an explicitly missing CSS entry produces one actionable warning', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-missing-theme-'))
  try {
    const warnings: string[] = []
    const theme = await loadProjectTheme(root, {
      css: 'styles/tailwind.css',
      warn: (message) => warnings.push(message),
    })

    assert.equal(theme, undefined)
    assert.deepEqual(warnings, [
      "[hozo] no stylesheet at styles/tailwind.css, so utilities resolve against Tailwind's defaults",
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('explicit fresh epochs bypass both project-theme and imported design-system caches', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-fresh-project-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const imported = path.join(root, 'tokens.css')
  writeFileSync(path.join(root, 'global.css'), '@import "tailwindcss"; @import "./tokens.css";')
  writeFileSync(
    imported,
    '@theme { --spacing: 0.25rem; --breakpoint-sm: 30rem; --breakpoint-md: 40rem; }',
  )
  const names = ['md:p-4', 'sm:p-4']
  assert.equal((await loadProjectTheme(root))?.spacingPx, 4)
  assert.deepEqual(await loadProjectClassOrder(root, names), ['sm:p-4', 'md:p-4'])
  writeFileSync(
    imported,
    '@theme { --spacing: 0.5rem; --breakpoint-sm: 80rem; --breakpoint-md: 40rem; }',
  )
  assert.equal(
    (await loadProjectTheme(root))?.spacingPx,
    4,
    'default memoization contract is unchanged',
  )
  assert.equal((await loadProjectTheme(root, { fresh: true }))?.spacingPx, 8)
  assert.deepEqual(await loadProjectClassOrder(root, names, { fresh: true }), ['md:p-4', 'sm:p-4'])
})
