import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readEmulatorCrashReports, readQemuExit } from './android-crash-evidence.mjs'

test('QEMU wait status distinguishes a signal from a normal exit and a live process', () => {
  function procStat(state, waitStatus) {
    return () => `5411 (qemu (test) x86) ${state} ${'0 '.repeat(48)}${waitStatus}\n`
  }
  assert.deepEqual(readQemuExit(5411, procStat('Z', 139)), {
    pid: 5411,
    waitStatus: 139,
    exitCode: null,
    signal: 11,
    coreDumped: true,
  })
  assert.equal(readQemuExit(5411, procStat('Z', 7 << 8)).exitCode, 7)
  assert.equal(readQemuExit(5411, procStat('S', 0)), null)
  assert.equal(
    readQemuExit(5411, () => '5411 (qemu) Z 1'),
    null,
  )
  assert.equal(
    readQemuExit(5411, () => {
      throw new Error('process already reaped')
    }),
    null,
  )
})

test('Crashpad reports expose exception metadata and tolerate incomplete dumps', () => {
  const root = mkdtempSync(join(tmpdir(), 'hozo-emulator-crash-'))
  const database = 'emu-crash-37.2.13.db'
  const pending = join(root, database, 'pending')
  try {
    assert.deepEqual(readEmulatorCrashReports(root), { databases: [], reports: [] })
    mkdirSync(pending, { recursive: true })
    const dump = Buffer.alloc(76)
    dump.write('MDMP')
    dump.writeUInt32LE(1, 8)
    dump.writeUInt32LE(32, 12)
    dump.writeUInt32LE(6, 32)
    dump.writeUInt32LE(168, 36)
    dump.writeUInt32LE(44, 40)
    dump.writeUInt32LE(11, 52)
    dump.writeInt32LE(1, 56)
    dump.writeBigUInt64LE(0x1234n, 68)
    writeFileSync(join(pending, 'valid.dmp'), dump)
    writeFileSync(join(pending, 'incomplete.dmp'), dump.subarray(0, 45))
    const { databases, reports } = readEmulatorCrashReports(root)
    assert.deepEqual(databases, [database])
    const byName = Object.fromEntries(reports.map((report) => [report.name, report]))
    assert.deepEqual(byName['valid.dmp'].exception, {
      signal: 11,
      signalCode: 1,
      address: '0x1234',
    })
    assert.equal(byName['incomplete.dmp'].error, 'Incomplete minidump')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
