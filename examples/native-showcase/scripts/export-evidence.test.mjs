import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { EXPORT_TIMEOUT_MS, verifyExpoExport } from './export-evidence.mjs'

function fixture(t, body) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-export-probe-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cli = path.join(root, 'cli.mjs')
  writeFileSync(
    cli,
    `import {writeFileSync,mkdirSync} from 'node:fs'; import path from 'node:path';
    const args=process.argv.slice(2); const output=args[args.indexOf('--output-dir')+1]; const platform=args[args.indexOf('--platform')+1];
    ${body}`,
  )
  const read = (platform = 'android') =>
    JSON.parse(readFileSync(path.join(root, 'artifacts/bundle-exports', `${platform}.json`)))
  return { root, cli, read }
}

const complete = `mkdirSync(output,{recursive:true}); writeFileSync(path.join(output,'index.bundle'),'fresh Native fixture'); writeFileSync(path.join(output,'metadata.json'),JSON.stringify({fileMetadata:{[platform]:{bundle:'index.bundle',assets:[]}}}));`

test('real small CLI verifies fresh output and retains elapsed time, process facts and hashes', (t) => {
  const f = fixture(t, complete)
  let verified = 0
  for (const platform of ['android', 'ios']) {
    const result = verifyExpoExport({
      ...f,
      platform,
      verify: ({ output, metadata }) => {
        assert.equal(
          readFileSync(path.join(output, metadata.fileMetadata[platform].bundle), 'utf8'),
          'fresh Native fixture',
        )
        verified++
      },
    })
    assert.match(result.output, new RegExp(`check-${platform}-`))
    const evidence = f.read(platform)
    assert.equal(evidence.passed, true)
    assert.equal(evidence.phase, 'complete')
    assert.equal(evidence.process.status, 0)
    assert.equal(evidence.process.error, null)
    assert.equal(evidence.timeoutMs, 180_000)
    assert.match(evidence.bundleSha256, /^[a-f0-9]{64}$/)
    assert.match(evidence.metadataSha256, /^[a-f0-9]{64}$/)
    assert.ok(evidence.elapsedMs >= 0)
  }
  assert.equal(verified, 2)
})

test('status zero cannot swallow a spawn timeout or signal, and neither is retried', (t) => {
  const f = fixture(t, '')
  for (const partial of [
    { error: Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' }) },
    { signal: 'SIGTERM' },
  ]) {
    let launches = 0
    let verified = false
    assert.throws(
      () =>
        verifyExpoExport({
          ...f,
          platform: 'android',
          run: () => {
            launches++
            return { status: 0, signal: null, ...partial }
          },
          verify: () => {
            verified = true
          },
        }),
      /export (failed|interrupted)/,
    )
    assert.equal(launches, 1)
    assert.equal(verified, false)
    assert.equal(f.read().passed, false)
    assert.equal(f.read().phase, 'process')
  }
})

test('a real SIGTERM handler can return zero while spawn reports ETIMEDOUT', {
  skip: process.platform === 'win32',
}, (t) => {
  const f = fixture(t, `process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000);`)
  assert.throws(
    () =>
      verifyExpoExport({
        ...f,
        platform: 'android',
        timeout: 400,
        verify: () => assert.fail('must not validate'),
      }),
    /ETIMEDOUT/,
  )
  const evidence = f.read()
  assert.equal(evidence.process.status, 0)
  assert.equal(evidence.process.error.code, 'ETIMEDOUT')
  assert.equal(evidence.passed, false)
})

test('a stale conventional export cannot certify an incomplete successful child', (t) => {
  const f = fixture(t, '')
  const stale = path.join(f.root, 'dist/check-android')
  mkdirSync(stale, { recursive: true })
  writeFileSync(path.join(stale, 'metadata.json'), '{}')
  assert.throws(
    () => verifyExpoExport({ ...f, platform: 'android', verify: () => assert.fail('not fresh') }),
    /without fresh metadata/,
  )
  const evidence = f.read()
  assert.equal(evidence.phase, 'metadata')
  assert.equal(evidence.process.status, 0)
  assert.equal(evidence.passed, false)
  assert.notEqual(evidence.output.replaceAll('\\', '/'), 'dist/check-android')
  assert.equal(
    readFileSync(path.join(stale, 'metadata.json'), 'utf8'),
    '{}',
    'never remove user output',
  )
})

test('nonzero exit, invalid metadata, missing bundle and content failure remain failed evidence', (t) => {
  for (const [body, pattern, phase] of [
    ['process.exitCode=3', /exit 3/, 'process'],
    ["writeFileSync(path.join(output,'metadata.json'),'{')", /JSON/, 'metadata'],
    [
      "writeFileSync(path.join(output,'metadata.json'),JSON.stringify({fileMetadata:{ios:{bundle:'wrong',assets:[]}}}))",
      /no bundle entry/,
      'metadata',
    ],
    [complete, /fixture missing story/, 'content'],
  ]) {
    const f = fixture(t, body)
    assert.throws(
      () =>
        verifyExpoExport({
          ...f,
          platform: 'android',
          verify: () => {
            throw new Error('fixture missing story')
          },
        }),
      pattern,
    )
    assert.equal(f.read().passed, false)
    assert.equal(f.read().phase, phase)
  }
})

test('the heavy report bounds app concurrency without widening the original export deadline', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/deploy-pages.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /integration pnpm test:integration --concurrency=2/)
  assert.equal(EXPORT_TIMEOUT_MS, 180_000)
})
