// A projection of a frozen capture, never a dependency/package-name resolver.
import { createHash } from 'node:crypto'
import type { OwnerManifestCapture } from './owner-manifest-capture.ts'

type CompleteCapture = Extract<OwnerManifestCapture, { status: 'complete' }>
type Manifest = NonNullable<CompleteCapture['bindings'][number]['manifest']>
interface InstanceContribution {
  readonly instance: string
  readonly entries: readonly string[]
  readonly file: string
  readonly sha256: string
  readonly data: NonNullable<Manifest['package']>
}
export type OwnerPackageContributions =
  | { readonly status: 'incomplete'; readonly reasons: readonly string[] }
  | {
      readonly status: 'complete'
      readonly fingerprint: string
      readonly candidates: readonly string[]
      readonly instances: readonly InstanceContribution[]
      readonly unassessed: readonly string[]
    }

/** @internal Only candidates are a union. Helper/export/text declarations keep
 * their instance boundary; this must not become a global name-to-facts table.
 * A complete participant set does not assess ordinary nonparticipants' styles.
 */
export function collectOwnerPackageContributions(
  capture: OwnerManifestCapture,
): OwnerPackageContributions {
  const incomplete = (reasons: string[]): OwnerPackageContributions =>
    Object.freeze({ status: 'incomplete', reasons: Object.freeze(reasons) })
  if (capture.status !== 'complete') return incomplete(['owner-resolution-incomplete'])
  const reasons = new Set<string>(),
    unassessed = new Set<string>()
  const instances = new Map<string, { manifest: Manifest; entries: Set<string> }>()
  for (const binding of capture.bindings) {
    if (!binding.manifest) {
      unassessed.add(binding.instance)
      continue
    }
    if (!binding.manifest.package) {
      reasons.add(`package-channels-unavailable:${binding.instance}`)
      continue
    }
    const item = instances.get(binding.instance) ?? {
      manifest: binding.manifest,
      entries: new Set<string>(),
    }
    item.entries.add(binding.entry)
    instances.set(binding.instance, item)
  }
  if (reasons.size) return incomplete([...reasons].sort())
  const contributions = [...instances]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([instance, { manifest, entries }]) =>
      Object.freeze({
        instance,
        entries: Object.freeze([...entries].sort()),
        file: manifest.file,
        sha256: manifest.sha256,
        data: manifest.package!,
      }),
    )
  return Object.freeze({
    status: 'complete',
    fingerprint: createHash('sha256')
      .update(JSON.stringify(['owner-package-contributions-0', capture.fingerprint]))
      .digest('hex'),
    candidates: Object.freeze(
      [...new Set(contributions.flatMap((item) => item.data.candidates))].sort(),
    ),
    instances: Object.freeze(contributions),
    unassessed: Object.freeze([...unassessed].sort()),
  })
}
