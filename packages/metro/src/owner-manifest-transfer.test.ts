import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { OWNER_PACKAGE_SCHEMA } from '@hozo/compiler/project'
import {
  METRO_OWNER_REQUEST,
  MetroOwnerManifestWorker,
  writeMetroOwnerManifestTransfer,
} from './owner-manifest-transfer.ts'

const context = { platform: 'android', epoch: 'compiler-theme-abi-policy' }
function fixture(t) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-owner-transfer-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const expected = [
    { importer: path.join(root, 'App.tsx'), specifier: 'widget-kit' },
    { importer: path.join(root, 'Panel.tsx'), specifier: 'widget-kit' },
  ]
  const resolutions = expected.map((edge, index) => {
    const packageRoot = path.join(root, `kit-${index}`),
      entry = path.join(packageRoot, 'native.js')
    mkdirSync(packageRoot)
    writeFileSync(entry, 'throw new Error("entry must never execute")')
    writeFileSync(
      path.join(packageRoot, 'owner.json'),
      JSON.stringify({
        schema: OWNER_PACKAGE_SCHEMA,
        owners: null,
        exports: [{ name: 'value', owners: [] }],
        candidates: [index ? 'p-2' : 'p-4'],
        helpers: [],
        compiledByConsumer: true,
        textForwarding: { version: 1, textForwarding: {} },
      }),
    )
    return { ...edge, packageRoot, entry, declaredManifest: 'owner.json' }
  })
  const seed = { schema: METRO_OWNER_REQUEST, ...context, expected, resolutions }
  const text = JSON.stringify(seed)
  const resolution = (index = 0) => ({
    instance: resolutions[index].packageRoot,
    entry: resolutions[index].entry,
    manifestFile: path.join(resolutions[index].packageRoot, 'owner.json'),
  })
  return { root, seed, text, resolution }
}
test('config/worker transfer is immutable, scoped and reproducible in another Node process', async (t) => {
  const f = fixture(t)
  const ref = writeMetroOwnerManifestTransfer(f.root, f.text)
  assert.deepEqual(writeMetroOwnerManifestTransfer(f.root, f.text), ref)
  assert.ok(Object.isFrozen(ref))
  const worker = new MetroOwnerManifestWorker(ref, context)
  assert.ok(Object.isFrozen(worker))
  assert.deepEqual(worker.contributions.candidates, ['p-2', 'p-4'])
  assert.equal(worker.contributions.instances.length, 2)
  worker.observeResolution(f.seed.expected[0], f.resolution())
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {MetroOwnerManifestWorker} from ${JSON.stringify(new URL('./owner-manifest-transfer.ts', import.meta.url).href)};
const worker=new MetroOwnerManifestWorker(${JSON.stringify(ref)},${JSON.stringify(context)});
console.log(JSON.stringify({candidates:worker.contributions.candidates,key:worker.cacheKey}));`,
      ],
      { encoding: 'utf8', timeout: 10000 },
    ),
  )
  assert.deepEqual(result.candidates, worker.contributions.candidates)
  assert.equal(result.key, worker.cacheKey)
  assert.equal(await worker.run((data) => data.instances.length), 2)
})
test('transfer tampering and platform/context mismatch never select another snapshot', (t) => {
  const f = fixture(t),
    ref = writeMetroOwnerManifestTransfer(f.root, f.text)
  assert.throws(
    () => new MetroOwnerManifestWorker(ref, { ...context, platform: 'ios' }),
    /platform\/context/,
  )
  assert.throws(
    () => new MetroOwnerManifestWorker(ref, { ...context, epoch: 'other-policy' }),
    /platform\/context/,
  )
  writeFileSync(ref.file, `${readFileSync(ref.file, 'utf8')}\n`)
  assert.throws(() => new MetroOwnerManifestWorker(ref, context), /hash mismatch/)
  assert.throws(() => writeMetroOwnerManifestTransfer(f.root, f.text), /immutable transfer changed/)
})
test('changed or missing source bytes reject startup and fresh capture changes the worker cache identity', (t) => {
  const f = fixture(t),
    old = writeMetroOwnerManifestTransfer(f.root, f.text)
  const oldKey = new MetroOwnerManifestWorker(old, context).cacheKey
  const file = f.resolution().manifestFile
  const data = JSON.parse(readFileSync(file, 'utf8'))
  data.candidates.push('p-8')
  writeFileSync(file, JSON.stringify(data))
  assert.throws(() => new MetroOwnerManifestWorker(old, context), /source bytes changed/)
  const next = writeMetroOwnerManifestTransfer(f.root, f.text)
  assert.notEqual(next.file, old.file)
  const worker = new MetroOwnerManifestWorker(next, context)
  assert.notEqual(worker.cacheKey, oldKey)
  assert.deepEqual(worker.contributions.candidates, ['p-2', 'p-4', 'p-8'])
  rmSync(file)
  assert.throws(() => new MetroOwnerManifestWorker(next, context), /INCOMPLETE/)
})
test('late or changed resolution retires pending output rather than extending a frozen union', async (t) => {
  const f = fixture(t),
    ref = writeMetroOwnerManifestTransfer(f.root, f.text)
  for (const late of [false, true]) {
    const worker = new MetroOwnerManifestWorker(ref, context)
    let release: () => void = () => {}
    const pending = worker.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    assert.throws(
      () =>
        worker.observeResolution(
          late ? { ...f.seed.expected[0], specifier: 'new-kit' } : f.seed.expected[0],
          late ? f.resolution() : { ...f.resolution(), entry: path.join(f.root, 'changed.js') },
        ),
      /resolution changed or arrived late/,
    )
    release()
    await assert.rejects(pending, /INVALIDATED/)
    await assert.rejects(
      worker.run(() => 'stale'),
      /INVALIDATED/,
    )
  }
})
test('partial, unsafe and owner-only seeds cannot publish a transfer', (t) => {
  const f = fixture(t)
  for (const input of [
    { ...f.seed, expected: [...f.seed.expected, { importer: 'late.ts', specifier: 'late-kit' }] },
    { ...f.seed, resolutions: [{ ...f.seed.resolutions[0], declaredManifest: '../outside.json' }] },
    { ...f.seed, schema: 'unknown' },
    { ...f.seed, execute: 'throw new Error()' },
  ])
    assert.throws(
      () => writeMetroOwnerManifestTransfer(f.root, JSON.stringify(input)),
      /Metro owner/,
    )
  writeFileSync(
    f.resolution().manifestFile,
    readFileSync(
      new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
      'utf8',
    ),
  )
  assert.throws(() => writeMetroOwnerManifestTransfer(f.root, f.text), /INCOMPLETE/)
  assert.equal(existsSync(path.join(f.root, 'node_modules/.hozo')), false)
})

test('declaration-path revalidation notices a replaced contained directory symlink', (t) => {
  const f = fixture(t),
    pkg = f.seed.resolutions[0]!.packageRoot
  const first = path.join(pkg, 'first'),
    second = path.join(pkg, 'second'),
    alias = path.join(pkg, 'alias')
  mkdirSync(first)
  mkdirSync(second)
  const body = readFileSync(f.resolution().manifestFile, 'utf8')
  writeFileSync(path.join(first, 'owner.json'), body)
  writeFileSync(path.join(second, 'owner.json'), `${body}\n`)
  const type = process.platform === 'win32' ? 'junction' : 'dir'
  symlinkSync(first, alias, type)
  f.seed.resolutions[0]!.declaredManifest = 'alias/owner.json'
  const ref = writeMetroOwnerManifestTransfer(f.root, JSON.stringify(f.seed))
  unlinkSync(alias)
  assert.equal(
    readFileSync(path.join(first, 'owner.json'), 'utf8'),
    body,
    'only the alias was removed',
  )
  symlinkSync(second, alias, type)
  assert.throws(() => new MetroOwnerManifestWorker(ref, context), /source bytes changed/)
})
