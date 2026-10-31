// Candidate-only consumption. Export/helper/text facts still belong to their
// actual package instance; this does not turn them into a global name table.

import type { CandidateContribution } from './candidate-reconciliation.ts'
import { type CandidateCache, openCandidateCache } from './index.ts'
import type { OwnerPackageContributions } from './owner-package-contributions.ts'

const manifestId = '\0hozo-owner-package-candidates.ts'

/** @internal A normal native scan record with an explicit manifest identity.
 * Adapters can reconcile it beside authored/derived records without inventing
 * scan facts in JS or turning package candidates into authored-file coverage.
 */
export function ownerPackageCandidateContribution(
  contributions: OwnerPackageContributions,
  sources?: readonly string[],
): CandidateContribution {
  if (contributions.status !== 'complete')
    throw new Error('Owner package candidates require complete contributions')
  const cache = openCandidateCache(undefined, sources)
  cache.scanFile(manifestId, `export default ${JSON.stringify(contributions.candidates)}`, 0)
  return Object.freeze({
    id: JSON.stringify(['owner-package-candidates', contributions.fingerprint]),
    revision: contributions.fingerprint,
    record: cache.exportFile(manifestId)!,
  })
}

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
  for (const file of new Set(authored.files)) {
    const record = authored.cache.exportFile(file)
    if (file === manifestId || record === null)
      throw new Error('Owner package candidates require every authored scan record')
    cache.importFile(file, record, 0)
  }
  const contribution = ownerPackageCandidateContribution(contributions, sources)
  cache.importFile(manifestId, contribution.record, 0)
  return cache
}
