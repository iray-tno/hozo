import type { ReactNativeImportAnalysis } from './analysis-rn.ts'
import type { ReactNativeUsage } from './index.ts'
import { type SourceEdit, SourceProvenance } from './source-provenance.ts'

export interface ReactNativeValueOutcome {
  bindingIndex: number
  referenceIndex: number
  disposition: 'rewritten-to-hozo' | 'remains-react-native' | 'not-assessed'
  sourceEvidence: 'unchanged-module-run' | 'not-assessed'
  /** Coordinates in emitted code; authored coordinates stay on the source reference. */
  emittedSpan?: { spanStart: number; spanEnd: number }
  replacement?: string
  reason: string
}

export interface ReactNativeValueAnalysis {
  status: 'completed' | 'partial' | 'failed' | 'not-assessed'
  scope: 'non-jsx-unchanged-module-runs'
  outputProvenance: 'completed' | 'unmapped' | 'not-assessed'
  generatedExpressions: 'not-assessed'
  memberCompatibility: 'not-assessed'
  dependencyRemoval: 'not-assessed'
  typeReferencesExcluded: number
  outcomes: ReactNativeValueOutcome[]
}

/**
 * A reference survives only with exact unchanged-run evidence through every
 * module splice AND an actual import-origin decision. A generated root may
 * carry an expression, but root membership or matching emitted text is not
 * proof of that reference's fate. Those expressions deliberately stay unknown.
 */
export function reactNativeValueJournal(
  source: string,
  usage: (ReactNativeUsage & { status: 'completed' | 'failed' }) | undefined,
) {
  const provenance = new SourceProvenance(source)
  const analysis: ReactNativeValueAnalysis = {
    status: usage?.status === 'completed' ? 'completed' : 'failed',
    scope: 'non-jsx-unchanged-module-runs',
    outputProvenance: 'not-assessed',
    generatedExpressions: 'not-assessed',
    memberCompatibility: 'not-assessed',
    dependencyRemoval: 'not-assessed',
    typeReferencesExcluded: 0,
    outcomes: [],
  }
  for (const [bindingIndex, binding] of (usage?.bindings ?? []).entries()) {
    for (const [referenceIndex, reference] of binding.references.entries()) {
      if (reference.kind === 'type') {
        analysis.typeReferencesExcluded += 1
        continue
      }
      if (reference.access === 'jsx') continue
      analysis.outcomes.push({
        bindingIndex,
        referenceIndex,
        disposition: 'not-assessed',
        sourceEvidence: 'not-assessed',
        reason: 'No verified final module reference provenance.',
      })
    }
  }
  return {
    analysis,
    edits(input: string, edits: readonly SourceEdit[]) {
      provenance.apply(input, edits)
    },
    finish(output: string | undefined, imports: ReactNativeImportAnalysis, succeeded: boolean) {
      if (output !== undefined && analysis.status !== 'failed') {
        if (provenance.matches(output)) {
          analysis.outputProvenance = 'completed'
          const origins = new Map(
            imports.outcomes.map((outcome) => [outcome.bindingIndex, outcome]),
          )
          for (const outcome of analysis.outcomes) {
            const reference =
              usage!.bindings[outcome.bindingIndex]!.references[outcome.referenceIndex]!
            const emitted = provenance.emitted(output, reference.spanStart, reference.spanEnd)
            if (!emitted) {
              outcome.reason =
                'Reference lies in generated/replaced source; unchanged-run evidence cannot determine whether it survived.'
              continue
            }
            outcome.sourceEvidence = 'unchanged-module-run'
            outcome.emittedSpan = emitted
            const origin = origins.get(outcome.bindingIndex)
            if (origin?.disposition === 'rewritten-to-hozo') {
              outcome.disposition = 'rewritten-to-hozo'
              outcome.replacement = origin.replacement
              outcome.reason =
                'Reference survives unchanged and its import was actually moved to Hozo; member compatibility is not certified.'
            } else if (origin?.disposition === 'retained-react-native') {
              outcome.disposition = 'remains-react-native'
              outcome.reason =
                'Reference survives unchanged and its import remains React Native-backed; no unsupported-API verdict follows.'
            } else
              outcome.reason =
                'Reference survives unchanged but no assessed import-origin decision is available.'
          }
        } else {
          analysis.outputProvenance = 'unmapped'
          analysis.status = 'partial'
        }
      }
      if (!succeeded || imports.status === 'failed') analysis.status = 'failed'
      else if (analysis.status !== 'failed') {
        if (imports.status === 'partial') analysis.status = 'partial'
        else if (imports.status === 'not-assessed' && analysis.status === 'completed')
          analysis.status = 'not-assessed'
      }
      return analysis
    },
  }
}
