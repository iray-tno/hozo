// Keep the event loop alive while a fixture child runs: output, cancellation
// and Node's test deadline must not wait for a synchronous spawn to return.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
export function fixtureNode(args, cwd, options = {}) {
  const pending = execute(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 262144,
    ...options,
  })
  const child = pending.child
  const closed = new Promise((resolve) => child.once('close', resolve))
  // AbortError can reject before Windows releases the child's cwd handle.
  // Delay BOTH outcomes until close, so test cleanup cannot race a live child.
  const delivered = pending.then(
    async (result) => {
      await closed
      return result
    },
    async (error) => {
      await closed
      throw error
    },
  )
  return Object.assign(delivered, { child })
}
