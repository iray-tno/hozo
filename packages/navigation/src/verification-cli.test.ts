import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runVerificationCli, type VerificationCliIO } from './verification-cli.ts'

test('generates configured assets and verifies them without writes', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hozo-links-cli-'))
  const logs: string[] = []
  const errors: string[] = []
  const io: VerificationCliIO = {
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
  }
  try {
    writeFileSync(
      path.join(directory, 'links.json'),
      JSON.stringify({
        outputDirectory: 'static',
        apple: [{ appIDs: ['ABCDE12345.com.example.app'] }],
        android: [
          {
            packageName: 'com.example.app',
            sha256CertFingerprints: ['0123456789abcdef'.repeat(4)],
          },
        ],
      }),
    )

    assert.equal(runVerificationCli(['--config', 'links.json'], directory, io), 0)
    assert.equal(logs.filter((line) => line.startsWith('wrote:')).length, 2)
    assert.equal(errors.length, 0)

    logs.length = 0
    assert.equal(runVerificationCli(['--check', '-c', 'links.json'], directory, io), 0)
    assert.equal(logs.filter((line) => line.startsWith('current:')).length, 2)

    writeFileSync(path.join(directory, 'static', '.well-known', 'assetlinks.json'), 'stale\n')
    assert.equal(runVerificationCli(['--check', '-c', 'links.json'], directory, io), 1)
    assert.match(errors.at(-1)!, /assetlinks\.json/)
    assert.doesNotThrow(() =>
      JSON.parse(
        readFileSync(
          path.join(directory, 'static', '.well-known', 'apple-app-site-association'),
          'utf8',
        ),
      ),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// RFC 011 §3: `2` is a command that could not run, `1` is kept for a stale
// file under --check, so CI can tell the two apart.
test('reports configuration and argument errors without throwing', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hozo-links-cli-errors-'))
  try {
    writeFileSync(path.join(directory, 'broken.json'), '{')
    writeFileSync(path.join(directory, 'wrong.json'), JSON.stringify({ apple: {} }))
    for (const [args, code] of [
      [['--wat'], 'unknown-option'],
      [['--config'], 'missing-value'],
      [['-c', 'missing.json'], 'config-not-found'],
      [['-c', 'broken.json'], 'invalid-config'],
      [['-c', 'wrong.json'], 'invalid-config'],
    ] as const) {
      const errors: string[] = []
      const io: VerificationCliIO = { log() {}, error: (message) => errors.push(message) }
      assert.equal(runVerificationCli(args, directory, io), 2, args.join(' '))
      assert.match(errors[0]!, new RegExp(`^hozo links: .* \\[${code}\\]$`))
    }
    const logs: string[] = []
    const io: VerificationCliIO = { log: (message) => logs.push(message), error() {} }
    assert.equal(runVerificationCli(['--help'], directory, io, 'hozo-links'), 0)
    assert.match(logs[0]!, /^Usage: hozo-links /)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

// npm links a bin into `node_modules/.bin` as a symlink. The entry check
// compared `argv[1]` (the link) with `import.meta.url` (the file), so the
// linked binary ran nothing and exited 0.
test('the binary runs when invoked through a symlink', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'hozo-links-bin-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  // The package's tests run from `.test-build`, compiled to `.js`; a direct
  // `node --test src/…` runs the `.ts`. Link whichever this file is.
  const extension = path.extname(fileURLToPath(import.meta.url))
  const link = path.join(directory, `hozo-links${extension}`)
  try {
    symlinkSync(
      fileURLToPath(new URL(`./verification-cli${extension}`, import.meta.url)),
      link,
      'file',
    )
  } catch (error) {
    // Windows without developer mode refuses symlinks; CI runs on Linux.
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return t.skip('symlinks unavailable')
    throw error
  }
  const result = spawnSync(process.execPath, [link, '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^Usage: hozo-links /)
  assert.match(result.stderr, /^hozo-links is deprecated/)
})
