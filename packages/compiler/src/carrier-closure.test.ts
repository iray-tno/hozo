import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { captureCarrierClosure, carrierGuard, carrierTripMessage } from './carrier-closure.ts'
import { buildPackageManifest, serializeManifest } from './manifest.ts'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const options = { platform: 'android', epoch: 'carrier-closure-test' }

function manifest(classes: string) {
  return serializeManifest(
    buildPackageManifest(
      { version: 1, textForwarding: {} },
      {
        exports: [],
        owners: null,
        helpers: [],
        compiledByConsumer: true,
        sources: [{ file: 'src/index.tsx', source: `export const x = "${classes}"` }],
      },
    ),
  )
}

/** Writes `node_modules/<name>` under `dir`, with an optional manifest. */
function install(
  dir: string,
  name: string,
  json: Record<string, unknown> = {},
  classes?: string,
): string {
  const root = path.join(dir, 'node_modules', name)
  mkdirSync(root, { recursive: true })
  writeFileSync(path.join(root, 'index.js'), 'module.exports = {}\n')
  if (classes !== undefined) writeFileSync(path.join(root, 'hozo.manifest.json'), manifest(classes))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name,
      main: 'index.js',
      ...(classes !== undefined ? { hozo: { manifest: './hozo.manifest.json' } } : {}),
      ...json,
    }),
  )
  return realpathSync(root)
}

function fixture(run: (app: string) => void) {
  const app = realpathSync(mkdtempSync(path.join(tmpdir(), 'hozo-carriers-')))
  try {
    run(app)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
}

test('a real app: every manifest its Metro build reaches, and nothing behind ordinary packages', () => {
  // docs/measurements/manifest-candidate-capture.md: native-showcase's
  // bundle reaches @hozo/ui, @hozo/patterns and @hozo/form. The app declares
  // only the first two; @hozo/form is reached through @hozo/ui.
  const closure = captureCarrierClosure(path.join(repo, 'examples/native-showcase'), options)
  const names = closure.carriers.map((row) => row.name)
  for (const name of ['@hozo/ui', '@hozo/patterns', '@hozo/form']) assert.ok(names.includes(name))
  assert.equal(closure.contributions.status, 'complete')
  if (closure.contributions.status !== 'complete') return
  assert.deepEqual(
    closure.contributions.instances.map((row) => row.instance),
    closure.carriers.map((row) => row.instance),
  )
  assert.ok(closure.contributions.candidates.length > 0)
  // Only carriers are descended, so Expo's and React Native's own trees are
  // not walked: the measured `declared` closure for this app was 712.
  assert.ok(closure.instances.size < 100, `${closure.instances.size} instances`)
})

test('descends into carriers only, follows the app devDependencies, and keeps unlocated names', () => {
  fixture((app) => {
    const kit = install(app, 'kit', { dependencies: { inner: '1' } }, 'p-4')
    const inner = install(kit, 'inner', {}, 'm-2')
    install(app, 'plain', { dependencies: { behind: '1' } })
    install(app, 'behind', {}, 'gap-3')
    const dev = install(app, 'dev-kit', {}, 'flex')
    // No "." and no "./package.json" export: located from the bare entry.
    const hidden = install(app, 'hidden', { exports: { '.': './index.js' } }, 'grid')
    // ESM only: nothing answers `require`, so only the node_modules lookup does.
    const esm = install(app, 'esm-only', { exports: { '.': { import: './index.js' } } }, 'block')
    writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: { kit: '1', plain: '1', ghost: '1', hidden: '1', 'esm-only': '1' },
        devDependencies: { 'dev-kit': '1' },
      }),
    )

    const closure = captureCarrierClosure(app, options)
    assert.deepEqual(
      closure.carriers.map((row) => [row.name, row.instance]),
      [
        ['dev-kit', dev],
        ['esm-only', esm],
        ['hidden', hidden],
        ['kit', kit],
        ['inner', inner],
      ].sort(([, a], [, b]) => (a! < b! ? -1 : 1)),
    )
    // `behind` carries a manifest, but only `plain` declares it, and `plain`
    // carries none: the resolve-time guard is what would catch it.
    assert.equal(closure.instances.has(realpathSync(path.join(app, 'node_modules/behind'))), false)
    assert.ok(closure.instances.has(realpathSync(path.join(app, 'node_modules/plain'))))
    assert.deepEqual(
      closure.unlocated.map((row) => row.specifier),
      ['ghost'],
    )
    assert.equal(closure.contributions.status, 'complete')
    if (closure.contributions.status !== 'complete') return
    assert.deepEqual(closure.contributions.candidates, ['block', 'flex', 'grid', 'm-2', 'p-4'])
  })
})

test('two installed versions of one name are two carriers', () => {
  fixture((app) => {
    const top = install(app, 'kit', {}, 'p-4')
    const wrapper = install(app, 'wrapper', { dependencies: { kit: '2' } }, 'p-1')
    const nested = install(wrapper, 'kit', {}, 'p-8')
    writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { kit: '1', wrapper: '1' } }),
    )
    const closure = captureCarrierClosure(app, options)
    assert.deepEqual(
      closure.carriers.map((row) => row.instance).sort(),
      [nested, top, wrapper].sort(),
    )
    assert.equal(closure.contributions.status, 'complete')
    if (closure.contributions.status !== 'complete') return
    assert.deepEqual(closure.contributions.candidates, ['p-1', 'p-4', 'p-8'])
  })
})

test('a carrier whose declared manifest is missing makes the whole capture incomplete', () => {
  fixture((app) => {
    install(app, 'kit', {}, 'p-4')
    const broken = install(app, 'broken', { hozo: { manifest: './gone.json' } })
    writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { kit: '1', broken: '1' } }),
    )
    const closure = captureCarrierClosure(app, options)
    assert.ok(closure.carriers.some((row) => row.instance === broken))
    assert.equal(closure.contributions.status, 'incomplete')
  })
})

test('over the edge budget is incomplete, not a partial set', () => {
  fixture((app) => {
    install(app, 'a', {}, 'p-1')
    install(app, 'b', {}, 'p-2')
    writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { a: '1', b: '1' } }),
    )
    const closure = captureCarrierClosure(app, { ...options, maxEdges: 1 })
    assert.deepEqual(closure.contributions, {
      status: 'incomplete',
      reasons: ['carrier-edge-budget'],
    })
  })
})

test('the guard trips only on a package with a manifest outside the capture', () => {
  fixture((app) => {
    const kit = install(app, 'kit', {}, 'p-4')
    install(app, 'plain', { dependencies: { behind: '1' } })
    const behind = install(app, 'behind', {}, 'gap-3')
    // A nested marker inside an ordinary package's dist must not hide it.
    mkdirSync(path.join(behind, 'dist'), { recursive: true })
    writeFileSync(path.join(behind, 'dist', 'package.json'), '{"type":"module"}')
    writeFileSync(path.join(behind, 'dist', 'index.js'), 'export {}\n')
    writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({
        name: 'app',
        hozo: { manifest: './gone.json' },
        dependencies: { kit: '1', plain: '1' },
      }),
    )
    writeFileSync(path.join(app, 'App.tsx'), 'export {}\n')
    const closure = captureCarrierClosure(app, options)
    const guard = carrierGuard(closure)
    // The app itself, a carrier, and an ordinary late package all pass.
    assert.equal(guard(path.join(app, 'App.tsx')), undefined)
    assert.equal(guard(path.join(kit, 'index.js')), undefined)
    assert.equal(guard(path.join(app, 'node_modules/plain/index.js')), undefined)
    assert.equal(guard('\0virtual:module'), undefined)
    // Reached only through `plain`: its candidates were never captured.
    const trip = guard(`${path.join(behind, 'dist', 'index.js')}?v=1`)
    assert.deepEqual(trip, { instance: behind, name: 'behind' })
    assert.match(carrierTripMessage(closure, trip!), /behind .*declares a Hozo manifest/)
  })
})

test('the guard passes every resolution a real app makes into its own packages', () => {
  const app = path.join(repo, 'examples/native-showcase')
  const guard = carrierGuard(captureCarrierClosure(app, options))
  for (const name of ['ui', 'patterns', 'form', 'core'])
    assert.equal(guard(path.join(repo, 'packages', name, 'src', 'index.ts')), undefined)
})
