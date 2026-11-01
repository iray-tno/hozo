// Explicit Native preview only. This owns the EXISTING project session, not a
// second rank cache or default adapter path. One selected owner per request.
import type { Compiler } from './index.ts'
import { type OwnerCallerPreview, prepareOwnerLiteralCallers } from './owner-caller-plan.ts'
import type { OwnerManifestLease } from './owner-manifest-epoch.ts'
import { collectOwnerPackageContributions } from './owner-package-contributions.ts'
import {
  type OwnerContractIdentity,
  type OwnerContractRequest,
  selectOwnerPackageContract,
} from './owner-package-selection.ts'
import { TailwindProjectSession } from './tailwind-session.ts'

export interface InstanceOwnerCallerPreview {
  readonly scope: 'explicit-instance-owner-preview'
  readonly identity: OwnerContractIdentity
  readonly preview: OwnerCallerPreview
}

/** @internal Own one matching compiler/CSS/manifest epoch. `prepare` has the
 * existing TailwindProjectSession contract: describe the entire requested
 * universe, including not-generated tokens. Adapters still own real resolution,
 * graph closure, fresh observations and compiler/CSS configuration watching.
 * Call invalidate on CSS/ABI changes or when this experiment is no longer used.
 */
export class InstanceOwnerCallerProject {
  readonly #lease: OwnerManifestLease
  #session: TailwindProjectSession | undefined
  #candidates: readonly string[]
  readonly #abort = () => this.invalidate()

  constructor(
    lease: OwnerManifestLease,
    compiler: Compiler,
    prepare: ConstructorParameters<typeof TailwindProjectSession>[1],
  ) {
    lease.check()
    if (!['ios', 'android', 'native'].includes(lease.capture.platform))
      throw new Error('OWNER_CALLER_NATIVE_PLATFORM_REQUIRED')
    const packages = collectOwnerPackageContributions(lease.capture)
    if (packages.status !== 'complete') throw new Error('OWNER_CALLER_PACKAGE_CHANNELS_INCOMPLETE')
    this.#lease = lease
    this.#candidates = packages.candidates
    this.#session = new TailwindProjectSession(compiler, prepare)
    lease.signal.addEventListener('abort', this.#abort, { once: true })
  }

  #check() {
    this.#lease.check()
    if (!this.#session) throw new Error('OWNER_CALLER_PROJECT_INVALIDATED')
  }

  async emit(source: string, request: OwnerContractRequest): Promise<InstanceOwnerCallerPreview> {
    this.#check()
    // Snapshot before suspension, including rejected requests. They must still
    // enter the session's per-module supersession fence, not revive old source.
    const input = { ...request }
    let identity: OwnerContractIdentity | undefined
    const [preview] = await this.#session!.emit(
      input.importer,
      [
        (compiler) => {
          const selected = selectOwnerPackageContract(this.#lease, input)
          if (selected.status !== 'selected')
            throw new Error(`OWNER_CONTRACT_UNASSESSED: ${selected.reason}`)
          selected.check()
          identity = selected.identity
          return prepareOwnerLiteralCallers(source, compiler, {
            source: selected.identity.specifier,
            imported: selected.identity.imported,
            shadow: selected.shadow,
            sourceFile: selected.identity.importer,
          })
        },
      ],
      this.#candidates,
    )
    this.#check()
    if (!identity || !preview) throw new Error('OWNER_CALLER_PREVIEW_NOT_PRODUCED')
    return Object.freeze({
      scope: 'explicit-instance-owner-preview',
      identity,
      preview,
    })
  }

  /** Abort waiting contexts promptly, dispose retained IR through the existing
   * session, and fence cache hits / late non-cooperative upstream results.
   */
  invalidate(): void {
    this.#session?.invalidate()
    this.#session = undefined
    this.#candidates = []
    this.#lease.signal.removeEventListener('abort', this.#abort)
  }
}
