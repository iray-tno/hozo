// Candidate-only consumption. Export/helper/text facts still belong to their
// actual package instance; this does not turn them into a global name table.
import { type CandidateCache, openCandidateCache } from './index.ts'
import type { OwnerPackageContributions } from './owner-package-contributions.ts'

/** @internal Startup-only overlay. Replay authored scan facts instead of
 * rescanning sources or editing the persistent source cache. Manifest tokens
 * enter the EXISTING scanner as a data-only string array, so utility recognition
 * and Native/Web generation remain Rust's authority, not another JS parser.
 */
export function withOwnerPackageCandidates(
  authored: { cache: CandidateCache; files: readonly string[] },
  contributions: OwnerPackageContributions,
  sources?: readonly string[],
): CandidateCache {
  if (contributions.status !== 'complete')
    throw new Error('Owner package candidates require complete contributions')
  if (!contributions.candidates.length) return authored.cache
  const cache = openCandidateCache(undefined, sources)
  // NUL cannot be an authored filesystem path. This record is never persisted.
  const manifestId = '\0hozo-owner-package-candidates.ts'
  for (const file of new Set(authored.files)) {
    const record = authored.cache.exportFile(file)
    if (file === manifestId || record === null)
      throw new Error('Owner package candidates require every authored scan record')
    cache.importFile(file, record, 0)
  }
  cache.scanFile(manifestId, `export default ${JSON.stringify(contributions.candidates)}`, 0)
  return cache
}
