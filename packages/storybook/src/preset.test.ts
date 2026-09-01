import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { viteFinal } from './preset.ts'

/** What Vite does with a nested plugin array, so the tests can look inside. */
const flatten = (plugins) => (plugins ?? []).flat(Infinity)

test('adds Hozo before Storybook framework plugins without replacing config', () => {
  const frameworkPlugin = { name: 'storybook:framework' }
  const config = {
    root: '/project',
    resolve: { alias: { '~': '/project/src' } },
    plugins: [frameworkPlugin],
  }

  const result = viteFinal(config, { css: 'src/theme.css', debug: true })

  assert.equal(result.root, '/project')
  assert.deepEqual(result.resolve, config.resolve)
  // `hozo()` is two plugins now -- one per bundler pass, see
  // `hozo:transformed` -- and Vite flattens a nested array. What this
  // asserts is unchanged: Hozo's plugins come first, and the framework's
  // own are still there, untouched, after them.
  assert.deepEqual(
    flatten(result.plugins).map((plugin) => plugin.name),
    ['hozo', 'hozo:transformed', 'storybook:framework'],
  )
  assert.equal(flatten(result.plugins).at(-1), frameworkPlugin)
})

test('forwards every option, not the ones it happens to name', async () => {
  // Regression: this destructured `{ css, content, debug }`, so an option
  // added to `@hozo/vite` later was accepted, type-checked, and dropped.
  // Checked through the plugin's own behaviour rather than by reading its
  // closure: with `root` forwarded, `buildStart` scans there instead of
  // the Vite root it was handed.
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-sb-'))
  try {
    writeFileSync(path.join(root, 'app.tsx'), "export const c = 'bg-emerald-500'\n")
    const [plugin] = flatten(viteFinal({ root: '/elsewhere' }, { root }).plugins) as {
      configResolved: (config: { root: string }) => void
      buildStart: (this: { warn: () => void; info: () => void }) => Promise<void>
    }[]
    plugin.configResolved({ root: '/elsewhere' })
    await plugin.buildStart.call({ warn: () => {}, info: () => {} })

    const css = readFileSync(path.join(root, 'node_modules', '.hozo', 'candidates.css'), 'utf8')
    assert.match(css, /\.bg-emerald-500/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
