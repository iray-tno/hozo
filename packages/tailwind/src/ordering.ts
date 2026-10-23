// Build-time data only. This is not a selector-specificity evaluator or a
// device resolver: a described Tailwind rule is not a Hozo support claim.
import { createHash } from 'node:crypto'
import type { __unstable__loadDesignSystem } from 'tailwindcss'

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>
type AstNode = ReturnType<DesignSystem['compileAstNodes']>[number]['node']

export type OrderRuleShape =
  | { readonly kind: 'rule'; readonly selector: string; readonly nodes: readonly OrderRuleShape[] }
  | {
      readonly kind: 'at-rule'
      readonly name: string
      readonly params: string
      readonly nodes: readonly OrderRuleShape[]
    }
  | { readonly kind: 'declaration'; readonly property: string; readonly important: boolean }
  | { readonly kind: 'comment' }
  | {
      readonly kind: 'context'
      readonly context: Readonly<Record<string, string | boolean>>
      readonly nodes: readonly OrderRuleShape[]
    }
  | { readonly kind: 'at-root'; readonly nodes: readonly OrderRuleShape[] }

export interface OrderRuleDescriptor {
  /** IDs are local to the snapshot fingerprint, not global utility ranks. */
  readonly id: number
  readonly candidateId: number
  readonly variantOrder: string
  readonly important: boolean
  readonly propertyOrder: readonly number[]
  readonly declarationCount: number
  /** Nesting stays intact. No inferred specificity is attached to it. */
  readonly shape: OrderRuleShape
}

export interface OrderCandidateDescriptor {
  readonly id: number
  readonly candidate: string
  readonly status: 'described' | 'not-generated'
  /** Upstream's first-rule rank only; never a replacement for `rules`. */
  readonly firstRuleRank: string | null
  readonly rules: readonly OrderRuleDescriptor[]
}

export interface TailwindOrderSnapshot {
  readonly schema: 1
  readonly policy: 'tailwind-rule-signatures-v1'
  readonly tailwindVersion: string
  readonly fingerprint: string
  readonly stylesheets: readonly { readonly file: string; readonly sha256: string }[]
  readonly candidates: readonly OrderCandidateDescriptor[]
}

export interface PreparedTailwindOrder {
  readonly snapshot: TailwindOrderSnapshot
  /** null means collect this candidate and prepare again, not rank zero. */
  readonly lookup: (candidate: string) => OrderCandidateDescriptor | null
}

export const orderingHash = (value: string) => createHash('sha256').update(value).digest('hex')

function shape(node: AstNode): OrderRuleShape {
  switch (node.kind) {
    case 'declaration':
      return { kind: node.kind, property: node.property, important: node.important }
    case 'comment':
      return { kind: node.kind }
    case 'rule':
      return { kind: node.kind, selector: node.selector, nodes: node.nodes.map(shape) }
    case 'at-rule':
      return { kind: node.kind, name: node.name, params: node.params, nodes: node.nodes.map(shape) }
    case 'context':
      return {
        kind: node.kind,
        context: Object.fromEntries(
          Object.entries(node.context).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ),
        nodes: node.nodes.map(shape),
      }
    case 'at-root':
      return { kind: node.kind, nodes: node.nodes.map(shape) }
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/** Called only after the complete observed candidate universe is collected. */
export function describeTailwindOrder(
  design: DesignSystem,
  candidates: readonly string[],
  tailwindVersion: string,
  stylesheets: { file: string; sha256: string }[],
): PreparedTailwindOrder {
  const names = [...new Set(candidates)].sort()
  // Variant positions are relative to all observed variants. Ask only after
  // parsing/compiling the complete universe, never once per module/class.
  const compiled = names.map((name) =>
    design.parseCandidate(name).map((candidate) => ({
      candidate,
      rules: design.compileAstNodes(candidate),
    })),
  )
  const firstRanks = new Map(design.getClassOrder(names))
  const variants = design.getVariantOrder()
  let nextRuleId = 0
  const descriptors = names.map((name, candidateId): OrderCandidateDescriptor => {
    const rules = compiled[candidateId]!.flatMap(({ candidate, rules }) => {
      let variantOrder = 0n
      for (const variant of candidate.variants) {
        const position = variants.get(variant)
        if (position === undefined) throw new Error(`Tailwind did not order a variant of ${name}`)
        variantOrder |= 1n << BigInt(position)
      }
      return rules.map(
        ({ node, propertySort }): OrderRuleDescriptor => ({
          id: nextRuleId++,
          candidateId,
          variantOrder: variantOrder.toString(),
          important: candidate.important || design.important,
          propertyOrder: [...propertySort.order],
          declarationCount: propertySort.count,
          shape: shape(node),
        }),
      )
    })
    return {
      id: candidateId,
      candidate: name,
      status: rules.length ? 'described' : 'not-generated',
      firstRuleRank: firstRanks.get(name)?.toString() ?? null,
      rules,
    }
  })
  const data = {
    schema: 1 as const,
    policy: 'tailwind-rule-signatures-v1' as const,
    tailwindVersion,
    stylesheets: stylesheets
      .map((entry) => ({ ...entry }))
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
    candidates: descriptors,
  }
  const snapshot = freeze({ ...data, fingerprint: orderingHash(JSON.stringify(data)) })
  const byName = new Map(snapshot.candidates.map((entry) => [entry.candidate, entry]))
  return Object.freeze({ snapshot, lookup: (candidate: string) => byName.get(candidate) ?? null })
}
