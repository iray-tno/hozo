import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

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

test('reports configuration and argument errors without throwing', () => {
  const errors: string[] = []
  const io: VerificationCliIO = { log() {}, error: (message) => errors.push(message) }
  assert.equal(runVerificationCli(['--wat'], process.cwd(), io), 1)
  assert.match(errors[0]!, /Unknown argument/)
})
