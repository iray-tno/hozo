// Metadata ownership of an already resolved file, not a dependency resolver.
import { createHash } from 'node:crypto'
import { lstatSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { readBoundedUtf8File } from './bounded-data.ts'
import type { ResolvedOwnerInstance } from './owner-manifest-read.ts'

export interface OwnerMetadataBoundary {
  readonly file: string
  /** null records an absent nearer package boundary, not an ordinary package. */
  readonly sha256: string | null
}

export type OwnerPackageLocation =
  | { readonly status: 'unresolved'; readonly reason: string }
  | {
      readonly status: 'resolved'
      readonly instance: Readonly<ResolvedOwnerInstance>
      readonly boundaries: readonly OwnerMetadataBoundary[]
    }

/** @internal Follow physical file ownership, never names/versions/exports.
 * Metadata is bounded data and entries/config are never executed. Missing,
 * malformed or inaccessible nearer metadata must not fall through to a host
 * application's declaration. A missing npm package stops at node_modules.
 * Adapters retain these positive AND absent boundary observations for their
 * epoch/watch fences; this standalone observer caches nothing across calls.
 */
export function locateResolvedOwnerPackage(id: string): OwnerPackageLocation {
  const unresolved = (reason: string): OwnerPackageLocation =>
    Object.freeze({ status: 'unresolved', reason })
  if (
    typeof id !== 'string' ||
    id.length > 4096 ||
    !path.isAbsolute(id) ||
    id.includes('\0') ||
    id.includes('?') ||
    id.includes('#')
  )
    return unresolved('non-physical-module-id')
  try {
    const entry = realpathSync(id)
    if (!statSync(entry).isFile()) return unresolved('entry-not-file')
    let directory = path.dirname(entry)
    const boundaries: OwnerMetadataBoundary[] = []
    for (let depth = 0; depth < 128; depth++) {
      if (path.basename(directory) === 'node_modules') return unresolved('package-metadata-missing')
      const file = path.join(directory, 'package.json')
      const stat = lstatSync(file, { throwIfNoEntry: false })
      if (!stat) boundaries.push(Object.freeze({ file, sha256: null }))
      else {
        // Symlinked metadata could claim a different installation as this
        // one's owner; refuse it rather than interpret a remote declaration.
        if (!stat.isFile() || stat.isSymbolicLink()) return unresolved('metadata-not-local-file')
        const text = readBoundedUtf8File(file, 65_536)
        const data: unknown = JSON.parse(text)
        if (!data || typeof data !== 'object' || Array.isArray(data))
          return unresolved('metadata-not-object')
        const record = data as Record<string, unknown>
        let declaredManifest: string | null = null
        if (Object.hasOwn(record, 'hozo')) {
          const hozo = record.hozo
          if (!hozo || typeof hozo !== 'object' || Array.isArray(hozo))
            return unresolved('hozo-metadata-not-object')
          if (Object.hasOwn(hozo, 'manifest')) {
            const value = (hozo as Record<string, unknown>).manifest
            if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
              return unresolved('manifest-declaration-invalid')
            declaredManifest = value
          }
        }
        boundaries.push(
          Object.freeze({ file, sha256: createHash('sha256').update(text).digest('hex') }),
        )
        return Object.freeze({
          status: 'resolved',
          instance: Object.freeze({ packageRoot: directory, entry, declaredManifest }),
          boundaries: Object.freeze(boundaries),
        })
      }
      const parent = path.dirname(directory)
      if (parent === directory) return unresolved('package-metadata-missing')
      directory = parent
    }
    return unresolved('package-boundary-depth-budget')
  } catch (error) {
    return unresolved(error instanceof Error ? error.message : String(error))
  }
}
