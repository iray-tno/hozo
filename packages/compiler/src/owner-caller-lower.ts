// Compose actual caller edits through ordinary lowering's verified source
// copies. No generated-JSX search, reparsing or independent lowering pipeline.
import type { Compiler, PreparedModule } from './index.ts'
import {
  type LoweredModule,
  type LowerModuleOptions,
  prepareLowerModule,
  runtimeImportOnlyModule,
} from './lower.ts'
import { prepareInstanceOwnerCallers } from './owner-caller-participant.ts'
import type { InstanceOwnerCallerPreview } from './owner-caller-project.ts'
import type { OwnerManifestLease } from './owner-manifest-epoch.ts'
import type { OwnerContractRequest } from './owner-package-selection.ts'
import { type SourceEdit, SourceProvenance } from './source-provenance.ts'
import type { StylexModuleCache } from './stylex-project.ts'

export interface OwnerLoweredModule {
  lowered: LoweredModule | undefined
  owners: readonly InstanceOwnerCallerPreview[]
}

/** @internal Web delivery participant. The adapter provides resolved requests
 * and its full universe/session. Neither a captured contract nor this function
 * certifies owner admission. Ordinary lowering is collected once, alongside
 * all requested owners; every emission uses the very same context.
 */
export function prepareOwnerLowerModule(
  source: string,
  id: string,
  file: string,
  compiler: Compiler,
  root: string,
  lease: OwnerManifestLease,
  requests: readonly OwnerContractRequest[],
  stylexModules?: StylexModuleCache,
  options: LowerModuleOptions = {},
): PreparedModule<OwnerLoweredModule> {
  lease.check()
  if (lease.capture.platform !== 'web') throw new Error('OWNER_LOWERING_REQUIRES_WEB')
  if (!requests.length || requests.length > 64) throw new Error('OWNER_LOWERING_REQUEST_BUDGET')
  if (requests.some((request) => request.importer !== file))
    throw new Error('OWNER_LOWERING_IMPORTER_MISMATCH')
  const owned: PreparedModule<InstanceOwnerCallerPreview>[] = []
  let ordinary: PreparedModule<LoweredModule | undefined> | undefined
  const provenance = new SourceProvenance(source)
  const observe = options.observe
  const dispose = () => {
    lease.signal.removeEventListener('abort', dispose)
    for (const module of owned.splice(0)) module.dispose()
    ordinary?.dispose()
    ordinary = undefined
  }
  try {
    for (const request of requests)
      owned.push(prepareInstanceOwnerCallers(lease, source, compiler, request))
    ordinary = prepareLowerModule(source, id, file, compiler, root, stylexModules, {
      ...options,
      observe(event) {
        if (event.edits && event.source !== undefined) provenance.apply(event.source, event.edits)
        observe?.(event)
      },
    })
    lease.signal.addEventListener('abort', dispose, { once: true })
    lease.check()
  } catch (error) {
    dispose()
    throw error
  }
  const candidates = Object.freeze(
    [...new Set([...ordinary.candidates, ...owned.flatMap((module) => module.candidates)])].sort(),
  )
  return {
    candidates,
    emit(context) {
      lease.check()
      if (!ordinary) throw new Error('Owner lowering has already been emitted or disposed')
      try {
        context.requireCandidates([...candidates])
        const owners = owned.map((module) => module.emit(context))
        const lowered = ordinary.emit(context)
        lease.check()
        const output = lowered?.code ?? source
        const edits: SourceEdit[] = []
        let reason: string | undefined
        for (const { preview } of owners) {
          for (const edit of preview.edits) {
            const range = provenance.emitted(output, edit.spanStart, edit.spanEnd)
            if (!range) reason = 'source-copy-unavailable'
            else edits.push({ ...range, replacement: edit.replacement })
          }
        }
        const ascending = edits.sort((a, b) => a.spanStart - b.spanStart)
        if (
          ascending.some(
            (edit, index) => index > 0 && edit.spanStart < ascending[index - 1]!.spanEnd,
          )
        )
          reason = 'overlapping-owner-edits'
        if (reason) {
          // Keep the entire ordinary result and original carrier; no orphan
          // CSS from an only-partially mapped owner plan is published.
          return {
            lowered,
            owners: owners.map((owner) => ({
              ...owner,
              preview: {
                ...owner.preview,
                code: source,
                css: '',
                edits: [],
                findings: owner.preview.findings.map((finding) =>
                  finding.disposition === 'prepared-literal'
                    ? { ...finding, disposition: 'retained' as const, reason }
                    : finding,
                ),
              },
            })),
          }
        }
        if (!edits.length) return { lowered, owners }
        let code = output
        for (const edit of ascending.reverse())
          code = code.slice(0, edit.spanStart) + edit.replacement + code.slice(edit.spanEnd)
        const base = lowered ?? runtimeImportOnlyModule(source, id, file)
        return {
          lowered: {
            ...base,
            code,
            // A prepared slot still belongs to its live widget, not a static
            // primitive. Never make an owner-only wrapper look script-free.
            needsClientBoundary: true,
            css: base.css + owners.map((owner) => owner.preview.css ?? '').join(''),
          },
          owners,
        }
      } catch (error) {
        lease.check()
        throw error
      } finally {
        dispose()
      }
    },
    dispose,
  }
}
