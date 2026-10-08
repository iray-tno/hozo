import type { ReactNativeUsage } from './index.ts'
import type { ReactNativeImportDecision } from './lower.ts'

export interface ReactNativeImportOutcome {
  /** Index into the canonical authored usage bindings, not an emitted-code census. */
  bindingIndex: number
  disposition: ReactNativeImportDecision['disposition'] | 'not-assessed'
  replacement?: ReactNativeImportDecision['replacement']
  reason: string
}

export interface ReactNativeImportAnalysis {
  status: 'completed' | 'partial' | 'failed' | 'not-assessed'
  scope: 'import-declarations'
  semanticReferences: 'not-assessed'
  memberCompatibility: 'not-assessed'
  dependencyRemoval: 'not-assessed'
  outcomes: ReactNativeImportOutcome[]
  unmappedDecisions: number
}

/**
 * Join the real lowerer's journal to authored symbols. The pipeline preserves
 * RN specifier tokens (even when it moves/splits declarations); only exact,
 * unique token + binding identities can carry provenance across those edits.
 * No post-lowering usage scan or duplicated ownership table is involved.
 * This is import provenance, not a source map for arbitrary JSX or expressions.
 */
export function reactNativeImportJournal(
  source: string,
  usage: (ReactNativeUsage & { status: 'completed' | 'failed' }) | undefined,
  enabled: boolean,
) {
  const analysis: ReactNativeImportAnalysis = {
    status: usage?.status !== 'completed' ? 'failed' : enabled ? 'completed' : 'not-assessed',
    scope: 'import-declarations',
    semanticReferences: 'not-assessed',
    memberCompatibility: 'not-assessed',
    dependencyRemoval: 'not-assessed',
    outcomes: [],
    unmappedDecisions: 0,
  }
  const candidates = new Map<string, number[]>()
  const identity = (
    binding: {
      imported: string
      local?: string
      typeOnly: boolean
      spanStart: number
      spanEnd: number
    },
    input: string,
  ) =>
    JSON.stringify([
      binding.imported,
      binding.local,
      binding.typeOnly,
      input.slice(binding.spanStart, binding.spanEnd),
    ])
  for (const [bindingIndex, binding] of (usage?.bindings ?? []).entries()) {
    analysis.outcomes.push({
      bindingIndex,
      disposition: 'not-assessed',
      reason:
        binding.kind !== 'import'
          ? 'Forwarding and side-effect edges are outside the import-specifier journal.'
          : !enabled
            ? 'Web import rewriting is disabled by policy.'
            : 'No safely joined import decision.',
    })
    if (binding.kind !== 'import' || usage?.status !== 'completed') continue
    const key = identity(binding, source)
    candidates.set(key, [...(candidates.get(key) ?? []), bindingIndex])
  }
  return {
    analysis,
    record(input: string, decisions: readonly ReactNativeImportDecision[]) {
      if (analysis.status === 'failed') return
      for (const decision of decisions) {
        const matches = candidates.get(identity(decision, input))
        if (matches?.length !== 1) {
          analysis.unmappedDecisions += 1
          continue
        }
        const bindingIndex = matches[0]!
        // A moved binding disappears from later RN import passes. A retained
        // binding may be moved by the component pass; record the actual latest
        // decision, not the runtime pass's prediction of that later stage.
        analysis.outcomes[bindingIndex] = {
          bindingIndex,
          disposition: decision.disposition,
          ...(decision.replacement ? { replacement: decision.replacement } : {}),
          reason: decision.reason,
        }
      }
    },
    finish(succeeded: boolean) {
      if (!succeeded) analysis.status = 'failed'
      else if (
        analysis.status === 'completed' &&
        (analysis.unmappedDecisions > 0 ||
          analysis.outcomes.some(
            (outcome) =>
              usage?.bindings[outcome.bindingIndex]?.kind === 'import' &&
              outcome.disposition === 'not-assessed',
          ))
      )
        analysis.status = 'partial'
      return analysis
    },
  }
}
