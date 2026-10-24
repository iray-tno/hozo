// One immutable project epoch. The adapter owns stylesheet/import watching
// and replaces this session with a matching compiler on configuration edits.
import {
  type Compiler,
  type PreparedModule,
  type PreparedTailwindContext,
  prepareTailwindContext,
} from './index.ts'
import { emitCollectedModules } from './tailwind-project.ts'

export class TailwindPreparationCancelled extends Error {
  readonly code: 'TAILWIND_PROJECT_INVALIDATED' | 'TAILWIND_MODULE_SUPERSEDED'

  constructor(code: TailwindPreparationCancelled['code']) {
    super(
      code === 'TAILWIND_PROJECT_INVALIDATED'
        ? 'Tailwind project session was invalidated'
        : 'Tailwind module request was superseded',
    )
    this.name = 'TailwindPreparationCancelled'
    this.code = code
  }
}

type Preparation = (names: readonly string[], signal: AbortSignal) => Promise<string>
type CachedContext = { key: string; context: PreparedTailwindContext }
type PendingContext = {
  key: string
  work: Promise<PreparedTailwindContext>
  waiters: Set<AbortSignal>
}
type Collector = (compiler: Compiler) => PreparedModule<unknown>
type CollectedResult<C extends Collector> = ReturnType<ReturnType<C>['emit']>

/** @internal Bounded context cache, not a source/IR/output cache.
 * A fresh session is required for a new project stylesheet/theme/config epoch.
 * Use a full lexical universe when outputs share a candidate namespace.
 */
export class TailwindProjectSession {
  #compiler: Compiler | undefined
  #prepare: Preparation | undefined
  #epoch = new AbortController()
  #ready: CachedContext | undefined
  #pending: PendingContext | undefined
  #serial: Promise<void> = Promise.resolve()
  #requests = new Map<string, AbortController>()

  constructor(compiler: Compiler, prepare: Preparation) {
    this.#compiler = compiler
    this.#prepare = prepare
  }

  /** Collect synchronously under this epoch, then await one shared context.
   * Reusing a module ID cancels only its previous pending request. IDs must
   * distinguish derived modules/platforms when the adapter runs both.
   */
  emit<C extends Collector>(
    id: string,
    collectors: readonly C[],
    additionalCandidates?: Iterable<string>,
  ): Promise<CollectedResult<C>[]>
  async emit(
    id: string,
    collectors: readonly Collector[],
    additionalCandidates: Iterable<string> = [],
  ): Promise<unknown[]> {
    this.#epoch.signal.throwIfAborted()
    const compiler = this.#compiler!
    const request = new AbortController()
    this.#requests.get(id)?.abort(new TailwindPreparationCancelled('TAILWIND_MODULE_SUPERSEDED'))
    this.#requests.set(id, request)
    const signal = AbortSignal.any([this.#epoch.signal, request.signal])
    try {
      return await emitCollectedModules(
        collectors.map((collect) => () => collect(compiler)),
        (names) => this.#contextFor(names, signal),
        additionalCandidates,
        signal,
      )
    } finally {
      // A superseded request finishing must not erase its replacement ticket.
      if (this.#requests.get(id) === request) this.#requests.delete(id)
    }
  }

  /** Close this epoch permanently; invalidation never retries old source. */
  invalidate(): void {
    this.#epoch.abort(new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED'))
    this.#ready = undefined
    this.#pending = undefined
    this.#requests.clear()
    // A non-cooperative upstream Promise can outlive this epoch. It need
    // not keep the old compiler/registry through this session's fields.
    this.#compiler = undefined
    this.#prepare = undefined
  }

  #contextFor(names: readonly string[], signal: AbortSignal): Promise<PreparedTailwindContext> {
    this.#epoch.signal.throwIfAborted()
    // Exact universes only. A rank from a subset/superset is a different
    // namespace even when it happens to contain all of this file's names.
    const key = JSON.stringify(names)
    if (this.#ready?.key === key) return Promise.resolve(this.#ready.context)
    if (this.#pending?.key === key) {
      for (const waiter of this.#pending.waiters)
        if (waiter.aborted) this.#pending.waiters.delete(waiter)
      this.#pending.waiters.add(signal)
      return this.#pending.work
    }
    const waiters = new Set([signal])
    const work = this.#serial.then(async () => {
      this.#epoch.signal.throwIfAborted()
      if (![...waiters].some((waiter) => !waiter.aborted))
        throw new TailwindPreparationCancelled('TAILWIND_MODULE_SUPERSEDED')
      if (this.#ready?.key === key) return this.#ready.context
      const snapshot = await this.#prepare!(names, this.#epoch.signal)
      // Cooperative cancellation is optional upstream, but a late result
      // cannot be decoded, installed or used after this epoch has closed.
      this.#epoch.signal.throwIfAborted()
      const context = prepareTailwindContext(snapshot)
      context.requireCandidates([...names])
      this.#ready = { key, context }
      return context
    })
    const pending = { key, work, waiters }
    this.#pending = pending
    // Only one ready and one last-pending index. Distinct universes queue
    // serially; do not retain an unbounded map of contexts or prepared IR.
    this.#serial = work.then(
      () => {},
      () => {},
    )
    const clear = () => {
      if (this.#pending === pending) this.#pending = undefined
    }
    work.then(clear, clear)
    return work
  }
}
