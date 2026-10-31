import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { TextDecoder } from 'node:util'

/** @internal Shared nonblocking, regular-file, bounded strict UTF-8 boundary.
 * Preserves BOM content; JSON/schema policy belongs to the caller.
 */
export function readBoundedUtf8File(file: string, limit: number): string {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8_388_608)
    throw new Error('data-size-budget-invalid')
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error('data-not-a-file')
    if (stat.size > limit) throw new Error('data-size-budget')
    const buffer = Buffer.alloc(limit + 1)
    let bytes = 0
    while (bytes < buffer.length) {
      const count = readSync(fd, buffer, bytes, buffer.length - bytes, bytes)
      if (count === 0) break
      bytes += count
    }
    if (bytes > limit) throw new Error('data-size-budget')
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      buffer.subarray(0, bytes),
    )
  } finally {
    closeSync(fd)
  }
}
