import type { CompiledComponent, ReactNativeUsage } from './index.ts'
import { type SourceEdit, SourceProvenance } from './source-provenance.ts'

export interface ReactNativeReferenceOutcome {
  bindingIndex: number
  referenceIndex: number
  disposition: 'replaced-jsx-tag' | 'preserved-jsx-tag' | 'removed-jsx-tag' | 'not-assessed'
  replacement?: string
  reason: string
}

export interface ReactNativeReferenceAnalysis {
  status: 'completed' | 'partial' | 'failed'
  scope: 'jsx-tag-emissions'
  nonJsxReferences: 'not-assessed'
  memberCompatibility: 'not-assessed'
  dependencyRemoval: 'not-assessed'
  outcomes: ReactNativeReferenceOutcome[]
  unmappedTags: number
}

/** Exact backend emissions joined to resolved authored symbols, never whole-root membership. */
export function reactNativeReferenceJournal(
  source: string,
  usage: (ReactNativeUsage & { status: 'completed' | 'failed' }) | undefined,
) {
  const provenance = new SourceProvenance(source)
  const analysis: ReactNativeReferenceAnalysis = {
    status: usage?.status === 'completed' ? 'completed' : 'failed',
    scope: 'jsx-tag-emissions',
    nonJsxReferences: 'not-assessed',
    memberCompatibility: 'not-assessed',
    dependencyRemoval: 'not-assessed',
    outcomes: [],
    unmappedTags: 0,
  }
  const jsx = new Map<string, number>()
  let semanticSeen = false
  for (const [bindingIndex, binding] of (usage?.bindings ?? []).entries()) {
    for (const [referenceIndex, reference] of binding.references.entries()) {
      const index = analysis.outcomes.length
      analysis.outcomes.push({
        bindingIndex,
        referenceIndex,
        disposition: 'not-assessed',
        reason:
          reference.kind === 'type'
            ? 'Type reference; no runtime tag emission.'
            : reference.access !== 'jsx'
              ? 'Non-JSX reference is outside this backend tag journal.'
              : 'No actual backend tag emission joined to this reference.',
      })
      if (reference.kind === 'runtime' && reference.access === 'jsx')
        jsx.set(`${reference.spanStart}:${reference.spanEnd}`, index)
    }
  }
  return {
    analysis,
    edits(input: string, edits: readonly SourceEdit[]) {
      // Import rewrites also happen after semantic splicing. That emitted
      // module is not the semantic backend's input and cannot remap its tags.
      if (!semanticSeen) provenance.apply(input, edits)
    },
    semantic(input: string, components: readonly CompiledComponent[]) {
      semanticSeen = true
      if (analysis.status === 'failed') return
      for (const component of components) {
        if (!component.tagDecisions) {
          analysis.status = 'partial'
          continue
        }
        for (const tag of component.tagDecisions) {
          const authored = provenance.authored(input, tag.spanStart, tag.spanEnd)
          if (!authored) {
            analysis.unmappedTags += 1
            continue
          }
          const index = jsx.get(`${authored.spanStart}:${authored.spanEnd}`)
          // Hozo, foreign and lexically shadowed names are not RN symbols.
          if (index === undefined) continue
          const outcome = analysis.outcomes[index]!
          const replacement = tag.replacement
          analysis.outcomes[index] = {
            bindingIndex: outcome.bindingIndex,
            referenceIndex: outcome.referenceIndex,
            disposition:
              replacement === undefined
                ? 'removed-jsx-tag'
                : replacement === source.slice(authored.spanStart, authored.spanEnd)
                  ? 'preserved-jsx-tag'
                  : 'replaced-jsx-tag',
            ...(replacement !== undefined ? { replacement } : {}),
            reason:
              replacement === undefined
                ? 'Authored closing tag consumed by an emitted void element.'
                : 'Tag emitted by the actual Web backend renderer; import origin is a separate journal.',
          }
        }
      }
    },
    finish(succeeded: boolean) {
      if (!succeeded) analysis.status = 'failed'
      else if (analysis.status === 'completed' && analysis.unmappedTags) analysis.status = 'partial'
      return analysis
    },
  }
}
