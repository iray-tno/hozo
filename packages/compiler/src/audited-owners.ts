// Default routing for audited package owner contracts (RFC 010 / decision 012).
// Reuses the shared caller planner and SourceProvenance rather than adding a
// second parser or rewriting generated JSX.
import { AUDITED_OWNER_CONTRACTS, type AuditedOwnerContract } from './audited-owner-contracts.ts'
import type { Compiler, PreparedModule, PreparedTailwindContext } from './index.ts'
import { type LoweredModule, runtimeImportOnlyModule } from './lower.ts'
import {
  type OwnerCallerPreview,
  prepareOwnerLiteralCallers,
  previewOwnerLiteralCallers,
} from './owner-caller-plan.ts'
import type { SourceEdit, SourceProvenance } from './source-provenance.ts'

export function matchingAuditedOwners(source: string): readonly AuditedOwnerContract[] {
  if (!AUDITED_OWNER_CONTRACTS.length) return []
  return AUDITED_OWNER_CONTRACTS.filter((contract) => source.includes(contract.package))
}

export function previewAuditedOwnerBatch(
  source: string,
  compiler: Compiler,
  target: 'web' | 'native',
  sourceFile?: string,
): OwnerCallerPreview[] {
  const contracts = matchingAuditedOwners(source)
  if (!contracts.length) return []
  return contracts.map((contract, index) =>
    previewOwnerLiteralCallers(source, compiler, {
      target,
      source: contract.package,
      imported: contract.exports,
      shadow: contract.shadow,
      sourceFile,
      planPrefix: `${index}_`,
    }),
  )
}

export function prepareAuditedOwnerBatch(
  source: string,
  compiler: Compiler,
  target: 'web' | 'native',
  sourceFile?: string,
): PreparedModule<OwnerCallerPreview[]> | undefined {
  const contracts = matchingAuditedOwners(source)
  if (!contracts.length) return undefined
  const prepared: PreparedModule<OwnerCallerPreview>[] = []
  const dispose = () => {
    for (const module of prepared.splice(0)) module.dispose()
  }
  try {
    for (let index = 0; index < contracts.length; index++) {
      const contract = contracts[index]!
      prepared.push(
        prepareOwnerLiteralCallers(source, compiler, {
          target,
          source: contract.package,
          imported: contract.exports,
          shadow: contract.shadow,
          sourceFile,
          planPrefix: `${index}_`,
        }),
      )
    }
  } catch (error) {
    dispose()
    throw error
  }
  const candidates = Object.freeze([...new Set(prepared.flatMap((m) => m.candidates))].sort())
  let active = true
  return {
    candidates,
    emit(context: PreparedTailwindContext) {
      if (!active) throw new Error('Audited owner batch has already been emitted or disposed')
      active = false
      try {
        return prepared.map((module) => module.emit(context))
      } finally {
        dispose()
      }
    },
    dispose() {
      if (!active) return
      active = false
      dispose()
    },
  }
}

export function applyWebOwnerPreviews(
  source: string,
  id: string,
  file: string,
  lowered: LoweredModule | undefined,
  provenance: SourceProvenance,
  previews: readonly OwnerCallerPreview[],
): LoweredModule | undefined {
  const output = lowered?.code ?? source
  const edits: SourceEdit[] = []
  let css = ''
  for (const preview of previews) {
    if (!preview.edits.length) continue
    for (const edit of preview.edits) {
      const range = provenance.emitted(output, edit.spanStart, edit.spanEnd)
      if (!range) return lowered
      edits.push({ ...range, replacement: edit.replacement })
    }
    css += preview.css ?? ''
  }
  if (!edits.length) return lowered
  const ascending = edits.sort((a, b) => a.spanStart - b.spanStart)
  if (ascending.some((edit, index) => index > 0 && edit.spanStart < ascending[index - 1]!.spanEnd))
    return lowered
  let code = output
  for (const edit of ascending.reverse())
    code = code.slice(0, edit.spanStart) + edit.replacement + code.slice(edit.spanEnd)
  const base = lowered ?? runtimeImportOnlyModule(source, id, file)
  return {
    ...base,
    code,
    needsClientBoundary: true,
    css: base.css + css,
  }
}

export function composeNativeOwnerPreviews(
  source: string,
  ordinary: string | null,
  provenance: SourceProvenance,
  previews: readonly OwnerCallerPreview[],
): string | null {
  const active = previews.filter((preview) => preview.edits.length > 0)
  if (!active.length) return ordinary
  const output = ordinary ?? source
  if (!provenance.matches(output)) return ordinary
  const preludes = new Map<number, string>()
  const edits: SourceEdit[] = []
  for (const preview of active) {
    const prelude = preview.modulePrelude
    if (!prelude || !preview.edits.includes(prelude) || prelude.spanStart !== prelude.spanEnd)
      return ordinary
    preludes.set(prelude.spanStart, (preludes.get(prelude.spanStart) ?? '') + prelude.replacement)
    for (const edit of preview.edits) {
      if (edit === prelude) continue
      const range =
        edit.spanStart === edit.spanEnd
          ? provenance.emittedInsertion(output, edit.spanStart)
          : provenance.emitted(output, edit.spanStart, edit.spanEnd)
      if (!range) return ordinary
      edits.push({ ...range, replacement: edit.replacement })
    }
  }
  for (const [offset, replacement] of preludes) {
    const range =
      offset === 0 && !source.startsWith('#!')
        ? { spanStart: 0, spanEnd: 0 }
        : provenance.emittedInsertion(output, offset)
    if (!range) return ordinary
    edits.push({ ...range, replacement })
  }
  edits.sort((a, b) => a.spanStart - b.spanStart || a.spanEnd - b.spanEnd)
  if (
    edits.some(
      (edit, index) =>
        index > 0 &&
        (edit.spanStart < edits[index - 1]!.spanEnd ||
          edit.spanStart === edits[index - 1]!.spanStart),
    )
  )
    return ordinary
  let code = output
  for (const edit of edits.reverse())
    code = code.slice(0, edit.spanStart) + edit.replacement + code.slice(edit.spanEnd)
  return code
}
