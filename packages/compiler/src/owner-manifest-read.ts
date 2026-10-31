// Read an adapter-resolved instance. No root walk, package-name lookup or
// executable config loader: resolution and graph completeness stay upstream.
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import type { OwnerImportEdge, OwnerManifestObservation } from './owner-manifest-capture.ts'

export interface ResolvedOwnerInstance {
  packageRoot: string
  entry: string
  /** Explicit package metadata decision: null means ordinary nonparticipant. */
  declaredManifest: string | null
}
const limit = 65_536
function inside(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
function boundedText(file: string) {
  // A .json-named FIFO must not hang the build before fstat can reject it.
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error('manifest-not-a-file')
    if (stat.size > limit) throw new Error('manifest-size-budget')
    const buffer = Buffer.alloc(limit + 1)
    let bytes = 0
    while (bytes < buffer.length) {
      const read = readSync(fd, buffer, bytes, buffer.length - bytes, bytes)
      if (read === 0) break
      bytes += read
    }
    if (bytes > limit) throw new Error('manifest-size-budget')
    // Preserve a BOM as content too: decoding must not hide a byte change from
    // capture identity or silently broaden the strict JSON reader's contract.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      buffer.subarray(0, bytes),
    )
  } finally {
    closeSync(fd)
  }
}

/** @internal Safe disk observation for the shadow capture. A valid JSON read
 * is not an owner audit; the existing shadow reader validates content later.
 * Virtual/non-file resolutions remain unresolved instead of guessing a package.
 */
export function readResolvedOwnerManifest(
  input: OwnerImportEdge,
  resolved: ResolvedOwnerInstance,
): OwnerManifestObservation {
  const edge = { importer: input.importer, specifier: input.specifier }
  const unresolved = (reason: string): OwnerManifestObservation => ({
    ...edge,
    status: 'unresolved',
    reason,
  })
  try {
    if (!path.isAbsolute(resolved.packageRoot) || !path.isAbsolute(resolved.entry))
      return unresolved('non-filesystem-resolution')
    const instance = realpathSync(resolved.packageRoot),
      entry = realpathSync(resolved.entry)
    if (!statSync(instance).isDirectory() || !statSync(entry).isFile() || !inside(instance, entry))
      return unresolved('entry-outside-instance-or-not-file')
    const base = { ...edge, status: 'resolved' as const, instance, entry }
    const declaration = resolved.declaredManifest
    if (declaration === null) return { ...base, manifest: { kind: 'none' } }
    if (
      typeof declaration !== 'string' ||
      !declaration ||
      declaration.length > 4096 ||
      declaration.includes('\0') ||
      declaration.includes('\\') ||
      /^[a-zA-Z]:/.test(declaration) ||
      path.isAbsolute(declaration) ||
      declaration.split('/').includes('..') ||
      path.extname(declaration) !== '.json'
    )
      return unresolved('unsafe-or-non-json-manifest-path')
    const declaredFile = path.resolve(instance, declaration)
    if (!inside(instance, declaredFile)) return unresolved('manifest-outside-instance')
    let file: string
    try {
      file = realpathSync(declaredFile)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { ...base, manifest: { kind: 'missing', file: declaredFile } }
      throw error
    }
    if (!inside(instance, file)) return unresolved('manifest-symlink-outside-instance')
    return { ...base, manifest: { kind: 'present', file, text: boundedText(file) } }
  } catch (error) {
    return unresolved(error instanceof Error ? error.message : String(error))
  }
}
