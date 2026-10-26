// The adapter supplies the authoritative source/derived-module set and exact
// input revisions. Compiler owns scan meaning and replay: no second scanner,
// stylesheet resolver, filesystem guess, or "latest worker wins" rule here.
import { type CandidateCache, openCandidateCache } from './index.ts'

export interface ExpectedCandidateSource {
  /** Full module identity, including environment/query where relevant. */
  id: string
  /** Adapter-validated input/transform revision, not a line number or mtime. */
  revision: string
}

export interface CandidateContribution extends ExpectedCandidateSource {
  /** Produced by CandidateCache.exportFile; never authored/reconstructed in JS. */
  record: string
}

interface ReconciliationIssue {
  id: string
  kind: 'missing' | 'stale' | 'conflict' | 'invalid'
  message?: string
}

export type RuntimeCandidateReconciliation =
  | {
      status: 'complete'
      cache: CandidateCache
      accepted: readonly string[]
      ignored: readonly string[]
    }
  | {
      status: 'incomplete'
      issues: readonly ReconciliationIssue[]
      accepted: readonly string[]
      ignored: readonly string[]
    }

/** @internal Reconstruct a source-fact union, not a final Tailwind rule context.
 * Keep configured authored content as well as active derived modules in expected;
 * an unreferenced authored file is not necessarily an unused runtime candidate.
 * "complete" means every declared input has compatible runtime scan facts;
 * static/actual compiler units must still join the final ordering namespace.
 * Incomplete input deliberately exposes no partial cache to a publisher.
 */
export function reconcileRuntimeCandidateContributions(
  expected: readonly ExpectedCandidateSource[],
  observations: readonly CandidateContribution[],
  sources?: readonly string[],
): RuntimeCandidateReconciliation {
  const revisions = new Map<string, string>()
  for (const { id, revision } of expected) {
    if (!id || !revision || revisions.has(id))
      throw new Error('Expected candidate sources need unique IDs and nonempty revisions')
    revisions.set(id, revision)
  }
  const byId = new Map<string, CandidateContribution[]>()
  const ignored = new Set<string>()
  for (const observation of observations) {
    if (!revisions.has(observation.id)) {
      ignored.add(observation.id)
      continue
    }
    const group = byId.get(observation.id) ?? []
    group.push(observation)
    byId.set(observation.id, group)
  }
  const cache = openCandidateCache(undefined, sources)
  const issues: ReconciliationIssue[] = []
  const accepted: string[] = []
  for (const id of [...revisions.keys()].sort()) {
    const all = byId.get(id) ?? []
    const records = new Set(
      all.filter((entry) => entry.revision === revisions.get(id)).map((entry) => entry.record),
    )
    if (records.size === 0) {
      issues.push({ id, kind: all.length ? 'stale' : 'missing' })
    } else if (records.size > 1) {
      issues.push({ id, kind: 'conflict' })
    } else {
      try {
        cache.importFile(id, [...records][0]!, 0)
        accepted.push(id)
      } catch (error) {
        issues.push({ id, kind: 'invalid', message: (error as Error).message })
      }
    }
  }
  const common = { accepted, ignored: [...ignored].sort() }
  return issues.length
    ? { status: 'incomplete', issues, ...common }
    : { status: 'complete', cache, ...common }
}
