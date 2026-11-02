// The adapter owns the session and candidate universe. This participant owns
// only the selected caller IR and its manifest lease, not another context cache.
import type { Compiler, PreparedModule } from './index.ts'
import { prepareOwnerLiteralCallers } from './owner-caller-plan.ts'
import type { InstanceOwnerCallerPreview } from './owner-caller-project.ts'
import type { OwnerManifestLease } from './owner-manifest-epoch.ts'
import { type OwnerContractRequest, selectOwnerPackageContract } from './owner-package-selection.ts'

export function ownerCallerTarget(lease: OwnerManifestLease): 'native' | 'web' {
  lease.check()
  if (!['web', 'ios', 'android', 'native'].includes(lease.capture.platform))
    throw new Error('OWNER_CALLER_PLATFORM_REQUIRED')
  return lease.capture.platform === 'web' ? 'web' : 'native'
}

/** @internal Collect before suspension, then consume the adapter's exact
 * context alongside its ordinary lowering. `candidates` describes this IR,
 * not a complete project/package universe; the adapter still supplies that
 * universe to its existing session. Selection never upgrades an owner audit.
 */
export function prepareInstanceOwnerCallers(
  lease: OwnerManifestLease,
  source: string,
  compiler: Compiler,
  request: OwnerContractRequest,
): PreparedModule<InstanceOwnerCallerPreview> {
  const target = ownerCallerTarget(lease)
  const selected = selectOwnerPackageContract(lease, { ...request })
  if (selected.status !== 'selected')
    throw new Error(`OWNER_CONTRACT_UNASSESSED: ${selected.reason}`)
  const module = prepareOwnerLiteralCallers(source, compiler, {
    target,
    source: selected.identity.specifier,
    imported: selected.identity.imported,
    shadow: selected.shadow,
    sourceFile: selected.identity.importer,
  })
  let retained = true
  const dispose = () => {
    if (!retained) return
    retained = false
    lease.signal.removeEventListener('abort', dispose)
    module.dispose()
  }
  lease.signal.addEventListener('abort', dispose, { once: true })
  // A custom compiler may retire the lease during synchronous collection too.
  try {
    selected.check()
  } catch (error) {
    dispose()
    throw error
  }
  return {
    candidates: module.candidates,
    emit(context) {
      selected.check()
      if (!retained)
        throw new Error('Owner caller participant has already been emitted or disposed')
      try {
        const preview = module.emit(context)
        selected.check()
        return Object.freeze({
          scope: 'explicit-instance-owner-preview' as const,
          identity: selected.identity,
          preview,
        })
      } catch (error) {
        // Retirement may release another shape during synchronous emission.
        // Report the invalid lease, not a downstream disposed-handle symptom.
        selected.check()
        throw error
      } finally {
        dispose()
      }
    },
    dispose,
  }
}
