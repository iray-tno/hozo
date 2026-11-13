import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { startAndroidHostEvidence } from './android-host-evidence.mjs'

test('Android host evidence retains the guest log and host state when logcat exits early', async () => {
  const output = mkdtempSync(join(tmpdir(), 'hozo-android-host-'))
  const child = spawn(process.execPath, [
    '-e',
    'console.log("last guest message"); console.error("device offline"); process.exitCode = 1',
  ])
  const evidence = startAndroidHostEvidence(output, () => child)
  try {
    evidence.sample('scenario-start', 'ui-docs')
    await once(child, 'close')
    evidence.sample('scenario-fail', 'ui-docs')
    const log = readFileSync(join(output, 'logcat.txt'), 'utf8')
    assert.match(log, /last guest message/)
    assert.match(log, /device offline/)
    const records = readFileSync(join(output, 'host.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse)
    assert.deepEqual(
      records.map(({ event }) => event),
      [
        'start',
        'scenario-start',
        'logcat-exit',
        'logcat-disconnected',
        'emulator-crash-reports',
        'scenario-fail',
        'emulator-crash-reports',
      ],
    )
    assert.equal(records[2].code, 1)
    assert.equal(records[2].stopped, false)
    assert.equal(records[5].scenario, 'ui-docs')
    assert.ok(records[5].memoryTotalBytes > 0)
  } finally {
    await evidence.stop()
    rmSync(output, { recursive: true, force: true })
  }
})
