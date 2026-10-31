import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { captureOwnerManifests } from './owner-manifest-capture.ts'
import { readResolvedOwnerManifest } from './owner-manifest-read.ts'

const text = readFileSync(
  new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
  'utf8',
)
const edge = { importer: 'App.tsx', specifier: 'example-kit' }
const options = { platform: 'native', epoch: 'test' }
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hozo-owner-read-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const packageRoot = path.join(dir, 'kit')
  mkdirSync(packageRoot)
  const entry = path.join(packageRoot, 'index.js')
  writeFileSync(entry, 'throw new Error("entry must never execute")')
  writeFileSync(path.join(packageRoot, 'owner.json'), text)
  return { dir, packageRoot, entry, declaredManifest: 'owner.json' }
}

test('safe disk observations preserve exact content and distinguish nonparticipants/missing/invalid promises', (t) => {
  const resolved = fixture(t)
  const observation = readResolvedOwnerManifest(edge, resolved)
  assert.equal(observation.status, 'resolved')
  if (observation.status === 'resolved' && observation.manifest.kind === 'present')
    assert.equal(observation.manifest.text, text)
  assert.equal(captureOwnerManifests([edge], [observation], options).status, 'complete')
  const none = readResolvedOwnerManifest(edge, { ...resolved, declaredManifest: null })
  assert.equal(captureOwnerManifests([edge], [none], options).status, 'complete')
  const missing = readResolvedOwnerManifest(edge, { ...resolved, declaredManifest: 'missing.json' })
  assert.equal(missing.status, 'resolved')
  if (missing.status === 'resolved') assert.equal(missing.manifest.kind, 'missing')
  assert.equal(captureOwnerManifests([edge], [missing], options).status, 'incomplete')
  writeFileSync(path.join(resolved.packageRoot, 'owner.json'), '{"run":"throw new Error()"}')
  const invalid = captureOwnerManifests(
    [edge],
    [readResolvedOwnerManifest(edge, resolved)],
    options,
  )
  assert.equal(invalid.status, 'incomplete')
  if (invalid.status === 'incomplete') assert.equal(invalid.issues[0]!.kind, 'invalid-manifest')
})

test('unsafe paths, directories, oversize, invalid UTF-8 and nonfilesystem entries stay unresolved', (t) => {
  const resolved = fixture(t)
  for (const declaredManifest of [
    '../escape.json',
    resolved.entry,
    'C:owner.json',
    'x\\owner.json',
    'index.js',
  ])
    assert.equal(
      readResolvedOwnerManifest(edge, { ...resolved, declaredManifest }).status,
      'unresolved',
    )
  mkdirSync(path.join(resolved.packageRoot, 'directory.json'))
  assert.equal(
    readResolvedOwnerManifest(edge, { ...resolved, declaredManifest: 'directory.json' }).status,
    'unresolved',
  )
  writeFileSync(path.join(resolved.packageRoot, 'owner.json'), ' '.repeat(65_537))
  assert.equal(readResolvedOwnerManifest(edge, resolved).status, 'unresolved')
  writeFileSync(path.join(resolved.packageRoot, 'owner.json'), Buffer.from([0xff, 0xfe]))
  assert.equal(readResolvedOwnerManifest(edge, resolved).status, 'unresolved')
  assert.equal(
    readResolvedOwnerManifest(edge, { ...resolved, entry: 'virtual:module' }).status,
    'unresolved',
  )
  const outside = path.join(resolved.dir, 'outside.js')
  writeFileSync(outside, '')
  assert.equal(
    readResolvedOwnerManifest(edge, { ...resolved, entry: outside }).status,
    'unresolved',
  )
})

test('canonical instance aliases agree while manifest directory symlinks cannot escape', (t) => {
  const resolved = fixture(t)
  const outside = path.join(resolved.dir, 'outside')
  mkdirSync(outside)
  writeFileSync(path.join(outside, 'owner.json'), text)
  const type = process.platform === 'win32' ? 'junction' : 'dir'
  symlinkSync(outside, path.join(resolved.packageRoot, 'escape'), type)
  const escaped = readResolvedOwnerManifest(edge, {
    ...resolved,
    declaredManifest: 'escape/owner.json',
  })
  assert.equal(escaped.status, 'unresolved')
  symlinkSync(resolved.packageRoot, path.join(resolved.dir, 'alias'), type)
  const alias = readResolvedOwnerManifest(edge, {
    ...resolved,
    packageRoot: path.join(resolved.dir, 'alias'),
    entry: path.join(resolved.dir, 'alias/index.js'),
  })
  assert.deepEqual(alias, readResolvedOwnerManifest(edge, resolved))
})

test('a JSON-named FIFO is rejected without blocking the reader', {
  skip: process.platform === 'win32',
}, (t) => {
  const resolved = fixture(t)
  execFileSync('mkfifo', [path.join(resolved.packageRoot, 'pipe.json')])
  // A subprocess deadline makes removing O_NONBLOCK fail instead of hanging
  // the parent test runner, whose timer cannot interrupt a blocking openSync.
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {readResolvedOwnerManifest} from ${JSON.stringify(new URL('./owner-manifest-read.ts', import.meta.url).href)};
console.log(JSON.stringify(readResolvedOwnerManifest(${JSON.stringify(edge)},${JSON.stringify({ ...resolved, declaredManifest: 'pipe.json' })})));`,
    ],
    { encoding: 'utf8', timeout: 10000 },
  )
  assert.equal(JSON.parse(output).status, 'unresolved')
  assert.match(JSON.parse(output).reason, /not-a-file/)
})
