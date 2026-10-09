import type { ReactNativeImportAnalysis } from './analysis-rn.ts'
import { type ReactNativeMemberContract, reviewReactNativeMember } from './analysis-rn-contracts.ts'
import type { ReactNativeUsage } from './index.ts'
import { type SourceEdit, type SourceEvidence, SourceProvenance } from './source-provenance.ts'

export interface ReactNativeValueOutcome {
  bindingIndex: number
  referenceIndex: number
  disposition: 'rewritten-to-hozo' | 'remains-react-native' | 'not-assessed'
  sourceEvidence: SourceEvidence | 'not-assessed'
  /** Coordinates in emitted code; authored coordinates stay on the source reference. */
  emittedSpan?: { spanStart: number; spanEnd: number }
  replacement?: string
  reason: string
  memberContract?: ReactNativeMemberContract
}

export interface ReactNativeValueAnalysis {
  status: 'completed' | 'partial' | 'failed' | 'not-assessed'
  scope: 'non-jsx-source-runs'
  outputProvenance: 'completed' | 'unmapped' | 'not-assessed'
  generatedExpressions: 'copied-runs-only'
  memberCompatibility: 'not-assessed'
  memberContracts: 'reviewed-web-subsets-v1'
  dependencyRemoval: 'not-assessed'
  typeReferencesExcluded: number
  outcomes: ReactNativeValueOutcome[]
}

/**
 * An origin verdict requires exact source-run evidence through every splice
 * AND an actual import decision. Backend copies retain only the ranges actually
 * emitted, not every source_text read or all expressions in a containing root.
 * Unsupported synthesized expressions stay unknown, not inferred from text.
 */
export function reactNativeValueJournal(
  source: string,
  usage: (ReactNativeUsage & { status: 'completed' | 'failed' }) | undefined,
) {
  const provenance = new SourceProvenance(source)
  const analysis: ReactNativeValueAnalysis = {
    status: usage?.status === 'completed' ? 'completed' : 'failed',
    scope: 'non-jsx-source-runs',
    outputProvenance: 'not-assessed',
    generatedExpressions: 'copied-runs-only',
    memberCompatibility: 'not-assessed',
    memberContracts: 'reviewed-web-subsets-v1',
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
                'Reference has no unique validated source run through generated/replaced output; its fate is not assessed.'
              continue
            }
            outcome.sourceEvidence = provenance.evidence(
              output,
              reference.spanStart,
              reference.spanEnd,
            )!
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
      // No new compatibility claim is promoted from an aborted/partial run.
      if (analysis.status === 'completed') {
        for (const outcome of analysis.outcomes) {
          const binding = usage!.bindings[outcome.bindingIndex]!
          outcome.memberContract = reviewReactNativeMember(
            binding,
            binding.references[outcome.referenceIndex]!,
            outcome,
          )
        }
      }
      return analysis
    },
  }
}
