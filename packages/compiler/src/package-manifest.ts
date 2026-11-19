// Producer for manifest v2 (#2044). The existing Rust scanner remains the
// authority for candidate extraction; this does not invent an export
// resolver, execute package code or infer owner contracts.
import { openCandidateCache } from './index.ts'
import type { HozoManifest } from './manifest.ts'
import {
  type HozoPackageManifest,
  OWNER_PACKAGE_SCHEMA,
  type OwnerPackageShadow,
  PACKAGE_MANIFEST_VERSION,
  parseOwnerPackageShadow,
} from './owner-package.ts'

export interface PackageManifestOptions {
  /** Resolved public VALUE exports, supplied by the package's build tool. */
  exports: OwnerPackageShadow['exports']
  owners: OwnerPackageShadow['owners']
  /** Authored in the style-slot catalog's `textHosts`; none when absent. */
  textPublish?: OwnerPackageShadow['textPublish']
  helpers: string[]
  compiledByConsumer: boolean
  /** Exactly the package-owned source set being published, not its tests,
   * stories or dependency implementations. No filesystem walk is implied.
   */
  sources: Iterable<{ file: string; source: string }>
}

/** Build once at package publication, not on an application's render path.
 * Missing/oversized/invalid channels fail; none are silently truncated.
 * Export membership alone does not establish class/helper/owner behavior.
 */
export function buildPackageManifest(
  text: HozoManifest,
  options: PackageManifestOptions,
): HozoPackageManifest {
  const cache = openCandidateCache()
  const seen = new Set<string>()
  let bytes = 0
  for (const { file, source } of options.sources) {
    if (
      typeof file !== 'string' ||
      !file ||
      file.length > 4096 ||
      file.includes('\0') ||
      typeof source !== 'string' ||
      seen.has(file)
    )
      throw new Error('Package manifest requires unique source identities and source text')
    seen.add(file)
    bytes += Buffer.byteLength(source, 'utf8')
    if (seen.size > 1024 || bytes > 16_777_216)
      throw new Error('Package manifest source budget exceeded')
    cache.scanFile(file, source, 0)
  }
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  const validated = parseOwnerPackageShadow(
    JSON.stringify({
      schema: OWNER_PACKAGE_SCHEMA,
      owners: options.owners,
      exports: [...options.exports].sort(byName),
      textPublish: [...(options.textPublish ?? [])].sort(byName),
      candidates: cache.candidates().sort(),
      helpers: [...options.helpers].sort(),
      compiledByConsumer: options.compiledByConsumer,
      textForwarding: text,
    }),
  )
  const manifest: HozoPackageManifest = {
    version: PACKAGE_MANIFEST_VERSION,
    exports: validated.exports,
    owners: validated.owners,
    textPublish: validated.textPublish,
    textForwarding: validated.textForwarding.textForwarding,
    candidates: validated.candidates,
    helpers: validated.helpers,
    compiledByConsumer: validated.compiledByConsumer,
  }
  // Pretty-printed output is bounded too, not just its compact intermediate.
  parseOwnerPackageShadow(`${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
