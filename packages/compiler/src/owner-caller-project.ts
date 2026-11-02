// Explicit platform-selected preview only. This owns the EXISTING project session, not a
// second rank cache or default adapter path. One selected owner per request.
import type { Compiler } from './index.ts'
import { ownerCallerTarget, prepareInstanceOwnerCallers } from './owner-caller-participant.ts'
import type { OwnerCallerPreview } from './owner-caller-plan.ts'
import type { OwnerManifestLease } from './owner-manifest-epoch.ts'
import { collectOwnerPackageContributions } from './owner-package-contributions.ts'
import type { OwnerContractIdentity, OwnerContractRequest } from './owner-package-selection.ts'
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
    ownerCallerTarget(lease)
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
    const [result] = await this.#session!.emit(
      input.importer,
      [(compiler) => prepareInstanceOwnerCallers(this.#lease, source, compiler, input)],
      this.#candidates,
    )
    this.#check()
    if (!result) throw new Error('OWNER_CALLER_PREVIEW_NOT_PRODUCED')
    return result
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
