// One finite publication, not a worker registry or a second source scanner.
import {
  type CandidateContribution,
  type ExpectedCandidateSource,
  reconcileRuntimeCandidateContributions,
} from './candidate-reconciliation.ts'
import {
  type NativeCandidatePlan,
  type PreparedModule,
  prepareTailwindContext,
  type Theme,
} from './index.ts'
import { emitTailwindContextBatch } from './tailwind-project.ts'

export interface CollectedTailwindModule<M extends PreparedModule<unknown>>
  extends ExpectedCandidateSource {
  /** Actual post-rewrite/compiler parse, not a lexical candidate estimate. */
  module: M
}

interface BatchIssue {
  id: string
  kind: 'missing' | 'stale' | 'duplicate' | 'runtime-incomplete'
  message?: string
}

export class TailwindBatchIncomplete extends Error {
  readonly code = 'TAILWIND_BATCH_INCOMPLETE'
  readonly issues: readonly BatchIssue[]
  constructor(issues: readonly BatchIssue[]) {
    super('Tailwind publication needs every current module and runtime source contribution')
    this.name = 'TailwindBatchIncomplete'
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })))
  }
}

type CollectedModules = readonly CollectedTailwindModule<PreparedModule<unknown>>[]
type BatchOutput<M extends CollectedModules> = ReturnType<M[number]['module']['emit']>

export interface FinalTailwindBatchRequest<M extends CollectedModules> {
  /** Authoritative full IDs (including backend/query/environment) and revisions. */
  expected: readonly ExpectedCandidateSource[]
  collected: M
  runtime: {
    expected: readonly ExpectedCandidateSource[]
    contributions: readonly CandidateContribution[]
    /** The scanner policy used by the matching project compiler. */
    sources?: readonly string[]
  }
  prepare(candidates: readonly string[], signal?: AbortSignal): Promise<string>
  /** Must match the compiler/captured stylesheet epoch; no inferred theme equivalence. */
  theme?: Theme
  signal?: AbortSignal
}

export interface FinalTailwindBatch<T> {
  fingerprint: string
  candidates: readonly string[]
  modules: readonly (ExpectedCandidateSource & { output: T })[]
  native: NativeCandidatePlan
  ignoredModules: readonly ExpectedCandidateSource[]
  ignoredRuntimeSources: readonly string[]
}

/** @internal Consume every handle, including ignored/stale ones. Reconcile
 * native scan facts and actual retained module units before one preparation.
 * Publish only after every module and the Native candidate plan succeeds in
 * that exact context. No partial cache/output is returned on any failure.
 *
 * Completeness is for this caller-declared finite batch, not proof that an
 * adapter supplied its whole graph, matching theme or final Web candidate CSS.
 * Current emitters/adapters keep their existing pass-through winner policy.
 */
export async function emitFinalTailwindBatch<M extends CollectedModules>(
  request: FinalTailwindBatchRequest<M>,
): Promise<FinalTailwindBatch<BatchOutput<M>>> {
  const collected = request.collected.map(({ id, revision, module }) => ({ id, revision, module }))
  const owned = new Set(collected.map(({ module }) => module))
  try {
    const signal = request.signal
    signal?.throwIfAborted()
    const theme = request.theme && structuredClone(request.theme)
    const prepare = request.prepare
    const expected = new Map<string, string>()
    for (const { id, revision } of request.expected) {
      if (!id || !revision || expected.has(id))
        throw new Error('Expected Tailwind modules need unique IDs and nonempty revisions')
      expected.set(id, revision)
    }
    if (owned.size !== collected.length)
      throw new TailwindBatchIncomplete([
        { id: '', kind: 'duplicate', message: 'One module handle occurs twice' },
      ])
    const accepted: CollectedTailwindModule<PreparedModule<unknown>>[] = []
    const ignored: ExpectedCandidateSource[] = []
    const issues: BatchIssue[] = []
    const byId = new Map<string, CollectedTailwindModule<PreparedModule<unknown>>[]>()
    for (const entry of collected) {
      const rows = byId.get(entry.id) ?? []
      rows.push(entry)
      byId.set(entry.id, rows)
    }
    for (const id of [...expected.keys()].sort()) {
      const observations = byId.get(id) ?? []
      const current = observations.filter((entry) => entry.revision === expected.get(id))
      if (!current.length) issues.push({ id, kind: observations.length ? 'stale' : 'missing' })
      else if (current.length !== 1) issues.push({ id, kind: 'duplicate' })
      else accepted.push(current[0]!)
    }
    for (const entry of collected) {
      if (!expected.has(entry.id) || entry.revision !== expected.get(entry.id))
        ignored.push(Object.freeze({ id: entry.id, revision: entry.revision }))
    }
    const runtime = reconcileRuntimeCandidateContributions(
      request.runtime.expected,
      request.runtime.contributions,
      request.runtime.sources,
    )
    if (runtime.status === 'incomplete')
      for (const issue of runtime.issues)
        issues.push({ id: issue.id, kind: 'runtime-incomplete', message: issue.kind })
    if (issues.length) throw new TailwindBatchIncomplete(issues)
    if (runtime.status !== 'complete') throw new Error('Incomplete Tailwind runtime source facts')
    const active = new Set(accepted.map(({ module }) => module))
    // Do not keep deleted/stale IR alive through an unrelated async prepare.
    for (const module of owned) {
      if (!active.has(module)) {
        module.dispose()
        owned.delete(module)
      }
    }
    signal?.throwIfAborted()
    let candidates: readonly string[] = []
    // Evaluate fallible input access before transferring ownership. If native
    // candidate enumeration fails, the outer finally must still own the IR.
    const runtimeCandidates = runtime.cache.candidates()
    const modules = accepted.map(({ module }) => module)
    for (const { module } of accepted) owned.delete(module)
    const cancellation = signal && { check: () => signal.throwIfAborted(), signal: () => signal }
    const batch = await emitTailwindContextBatch(
      modules,
      async (names) => {
        candidates = names
        const snapshot = await prepare(names, signal)
        signal?.throwIfAborted()
        const context = prepareTailwindContext(snapshot)
        context.requireCandidates([...names])
        return context
      },
      runtimeCandidates,
      cancellation,
    )
    signal?.throwIfAborted()
    const native = runtime.cache.renderNativeModulePlan(batch.context, theme)
    if (native.fingerprint !== batch.context.fingerprint)
      throw new Error('Tailwind candidate plan escaped the collected context')
    signal?.throwIfAborted()
    return {
      fingerprint: batch.context.fingerprint,
      candidates,
      modules: Object.freeze(
        accepted.map(({ id, revision }, index) =>
          Object.freeze({
            id,
            revision,
            output: batch.outputs[index] as BatchOutput<M>,
          }),
        ),
      ),
      native,
      ignoredModules: Object.freeze(
        ignored.sort((a, b) =>
          a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : a.revision < b.revision
                ? -1
                : a.revision > b.revision
                  ? 1
                  : 0,
        ),
      ),
      ignoredRuntimeSources: runtime.ignored,
    }
  } finally {
    for (const module of owned) module.dispose()
  }
}
