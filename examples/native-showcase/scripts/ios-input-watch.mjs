import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'

// Separate process: the smoke driver's synchronous command cannot run timers.
// Read-only sampling while an input is still blocked, never another input.
const [, , parent, output] = process.argv
await pause(10_000)
mkdirSync(output, { recursive: true })
const run = (command, args) => execFileSync(command, args, { timeout: 8_000 }).toString()
const pids = new Set()
for (const name of ['idb_companion', 'HozoShowcase']) {
  try {
    for (const pid of run('pgrep', ['-x', name]).trim().split(/\s+/)) {
      if (/^\d+$/.test(pid)) pids.add(pid)
    }
  } catch {
    /* Process may not exist. */
  }
}
try {
  for (const pid of run('pgrep', ['-P', parent]).trim().split(/\s+/)) {
    if (/^\d+$/.test(pid) && Number(pid) !== process.pid) pids.add(pid)
  }
} catch {
  /* No child remains. */
}
for (const pid of [...pids].slice(0, 4)) {
  try {
    writeFileSync(
      resolve(output, `${pid}-process.txt`),
      run('ps', ['-p', pid, '-o', 'pid,ppid,%cpu,state,etime,comm']),
    )
    run('/usr/bin/sample', [pid, '3', '1', '-file', resolve(output, `${pid}-sample.txt`)])
  } catch (error) {
    writeFileSync(resolve(output, `${pid}-sample-error.txt`), String(error))
  }
}
