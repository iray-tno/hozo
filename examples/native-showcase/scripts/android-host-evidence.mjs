import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { freemem, loadavg, totalmem } from 'node:os'
import { join } from 'node:path'
import { readEmulatorCrashReports, readQemuExit } from './android-crash-evidence.mjs'

const LOG_LIMIT = 16 * 1024 * 1024

function hostSnapshot() {
  const read = (file) => {
    try {
      return readFileSync(file, 'utf8').trim()
    } catch {
      return null
    }
  }
  const ps = spawnSync('ps', ['-eo', 'pid,ppid,stat,time,rss,comm'], {
    encoding: 'utf8',
    timeout: 1000,
  })
  const processes = ps.stdout
    ?.split('\n')
    .filter((line) => /\b(?:qemu-system-\S*|emulator|adb)$/.test(line))
  const qemuExits = (processes ?? []).flatMap((line) => {
    const [pid, , state, , , command] = line.trim().split(/\s+/)
    if (!command?.startsWith('qemu-system-') || !state.startsWith('Z')) return []
    const exit = readQemuExit(pid)
    return exit ? [{ ...exit, pid: Number(pid) }] : []
  })
  return {
    memoryTotalBytes: totalmem(),
    memoryFreeBytes: freemem(),
    loadAverage: loadavg(),
    memoryAvailable: read('/proc/meminfo')?.match(/^MemAvailable:\s+(.+)$/m)?.[1] ?? null,
    pressure: Object.fromEntries(
      ['cpu', 'memory', 'io'].map((resource) => [resource, read(`/proc/pressure/${resource}`)]),
    ),
    oomKills: read('/proc/vmstat')?.match(/^oom_kill (\d+)$/m)?.[1] ?? null,
    processes,
    qemuExits,
    processSampleError: ps.status === 0 ? undefined : String(ps.error ?? ps.stderr),
  }
}

export function startAndroidHostEvidence(
  output,
  startLogcat = () =>
    spawn('adb', ['logcat', '-b', 'all', '-v', 'threadtime'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
) {
  mkdirSync(output, { recursive: true })
  const timeline = join(output, 'host.jsonl')
  const log = join(output, 'logcat.txt')
  const previousLog = join(output, 'logcat.previous.txt')
  writeFileSync(timeline, '')
  writeFileSync(log, '')
  rmSync(previousLog, { force: true })
  let logBytes = 0
  let stopped = false
  let writingFailed = false

  function write(operation) {
    if (writingFailed) return
    try {
      operation()
    } catch (error) {
      writingFailed = true
      console.warn('Unable to write Android host evidence:', error.message)
    }
  }

  function record(event, fields = {}) {
    write(() =>
      appendFileSync(
        timeline,
        `${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`,
      ),
    )
  }

  function sample(event, scenario) {
    record(event, { scenario, ...hostSnapshot() })
    if (event === 'logcat-disconnected' || event === 'scenario-fail') {
      try {
        record('emulator-crash-reports', { trigger: event, ...readEmulatorCrashReports() })
      } catch (error) {
        record('emulator-crash-reports', { trigger: event, error: error.message })
      }
    }
  }

  const child = startLogcat()
  const closed = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      record('logcat-exit', { code, signal, stopped })
      if (!stopped) sample('logcat-disconnected')
      resolve()
    })
  })
  child.on('error', (error) => record('logcat-error', { message: error.message }))
  const saveLog = (chunk) => {
    write(() => {
      // Keep the most recent two segments, including the lead-up to a disconnect.
      if (logBytes + chunk.length > LOG_LIMIT && logBytes > 0) {
        renameSync(log, previousLog)
        logBytes = 0
      }
      appendFileSync(log, chunk)
      logBytes += chunk.length
    })
  }
  child.stdout.on('data', saveLog)
  child.stderr.on('data', saveLog)
  sample('start')
  const sampler = setInterval(() => sample('sample'), 10_000).unref()

  return {
    sample,
    async stop() {
      clearInterval(sampler)
      stopped = true
      child.kill('SIGKILL')
      await closed
    },
  }
}
