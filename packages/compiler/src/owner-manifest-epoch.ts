// A lifecycle fence, not a resolver or another candidate/rank namespace.
import {
  assertOwnerManifestCaptureCurrent,
  type OwnerManifestCapture,
} from './owner-manifest-capture.ts'

type CompleteCapture = Extract<OwnerManifestCapture, { status: 'complete' }>
export interface OwnerManifestLease {
  readonly capture: CompleteCapture
  readonly signal: AbortSignal
  check(): void
}

/** @internal Shadow adapter integration. Freeze only a complete declared set;
 * once invalidated, this epoch cannot be revived even by identical bytes.
 * Callers must check/adopt fresh observations at graph/freeze boundaries and
 * invalidate on watcher/config signals. No filesystem work occurs on a lease.
 */
export class OwnerManifestEpoch {
  #capture: CompleteCapture | undefined
  #controller = new AbortController()

  invalidate() {
    this.#controller.abort(new Error('OWNER_MANIFEST_EPOCH_INVALIDATED: rebuild before use'))
  }

  #check() {
    this.#controller.signal.throwIfAborted()
    if (!this.#capture) throw new Error('OWNER_MANIFEST_EPOCH_NOT_READY: capture before use')
  }

  adopt(current: OwnerManifestCapture): void {
    this.#controller.signal.throwIfAborted()
    try {
      if (this.#capture) assertOwnerManifestCaptureCurrent(this.#capture, current)
      else if (current.status !== 'complete')
        throw new Error('OWNER_MANIFEST_CAPTURE_INCOMPLETE: cannot freeze partial observations')
      // Equal observations never replace the originally frozen object.
      this.#capture ??= current as CompleteCapture
    } catch (error) {
      this.invalidate()
      throw error
    }
  }

  lease(): OwnerManifestLease {
    this.#check()
    return Object.freeze({
      capture: this.#capture!,
      signal: this.#controller.signal,
      check: () => this.#check(),
    })
  }

  /** Calculate, then fence delivery, including synchronous/cache-hit outputs.
   * The callback must not publish side effects before this promise resolves.
   * The fence cannot undo an external write made inside a callback.
   */
  async run<T>(calculate: (lease: OwnerManifestLease) => T | Promise<T>): Promise<T> {
    const lease = this.lease()
    const output = await calculate(lease)
    lease.check()
    return output
  }
}
