import { closeSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function readQemuExit(pid, read = readFileSync) {
  try {
    const stat = read(`/proc/${pid}/stat`, 'utf8')
    // The parenthesized comm field may contain spaces and parentheses.
    const fields = stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .split(/\s+/)
    if (fields[0] !== 'Z' || !/^\d+$/.test(fields[49] ?? '')) return null
    const waitStatus = Number(fields[49]) // proc_pid_stat(5), field 52
    const signal = waitStatus & 0x7f
    return {
      pid,
      waitStatus,
      exitCode: signal === 0 ? (waitStatus >>> 8) & 0xff : null,
      signal: signal || null,
      coreDumped: Boolean(waitStatus & 0x80),
    }
  } catch {
    // The parent may reap the process before we can read its exit status.
    return null
  }
}

function readCrashException(file) {
  const fd = openSync(file, 'r')
  try {
    const read = (offset, size) => {
      const buffer = Buffer.alloc(size)
      if (readSync(fd, buffer, 0, size, offset) !== size) throw new Error('Incomplete minidump')
      return buffer
    }
    const header = read(0, 32)
    if (header.toString('ascii', 0, 4) !== 'MDMP') throw new Error('Invalid minidump header')
    const count = header.readUInt32LE(8)
    if (count > 256) throw new Error('Minidump stream count exceeds limit')
    const streams = read(header.readUInt32LE(12), count * 12)
    for (let offset = 0; offset < streams.length; offset += 12) {
      if (streams.readUInt32LE(offset) !== 6) continue // ExceptionStream
      if (streams.readUInt32LE(offset + 4) < 32) throw new Error('Incomplete exception stream')
      const exception = read(streams.readUInt32LE(offset + 8), 32)
      return {
        signal: exception.readUInt32LE(8),
        signalCode: exception.readInt32LE(12),
        address: `0x${exception.readBigUInt64LE(24).toString(16)}`,
      }
    }
    return null
  } finally {
    closeSync(fd)
  }
}

export function readEmulatorCrashReports(root = join(tmpdir(), 'android-runner')) {
  const directories = (path) => {
    try {
      return readdirSync(path, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }
  const databases = directories(root)
    .filter((entry) => entry.isDirectory() && /^emu-crash-.*\.db$/.test(entry.name))
    .slice(0, 4)
  const reports = []
  for (const { name } of databases) {
    for (const state of ['pending', 'completed']) {
      const folder = join(root, name, state)
      const dumps = directories(folder)
        .filter((entry) => entry.isFile() && entry.name.endsWith('.dmp'))
        .slice(0, 8)
      for (const dump of dumps) {
        const report = { database: name, state, name: dump.name }
        try {
          reports.push({ ...report, exception: readCrashException(join(folder, dump.name)) })
        } catch (error) {
          reports.push({ ...report, error: error.message })
        }
      }
    }
  }
  // Summarize the exception fields without publishing the dump's process memory.
  return { databases: databases.map((database) => database.name), reports }
}
