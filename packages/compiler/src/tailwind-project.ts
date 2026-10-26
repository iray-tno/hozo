// Compiler owns retained IR/context handles. The caller owns asynchronous
// stylesheet preparation, so compiler/project does not depend on Tailwind JS.
import {
  type PreparedModule,
  type PreparedTailwindContext,
  prepareTailwindContext,
} from './index.ts'

type ContextResult = PreparedTailwindContext | Promise<PreparedTailwindContext>

interface Cancellation {
  check(): void
  /** Allocate wait signals only if preparation actually suspends. */
  signal(): AbortSignal
}

/** @internal Takes ownership of a bounded, process-local module batch.
 * Include the lexical/cache universe as well for generated dynamic fallback.
 * All candidates are captured before awaiting; prepare must describe the whole
 * universe, including explicit not-generated entries. No global setter is used.
 */
export function emitTailwindModules<M extends PreparedModule<unknown>>(
  modules: readonly M[],
  prepare: (candidates: readonly string[]) => Promise<string>,
  additionalCandidates?: Iterable<string>,
): Promise<ReturnType<M['emit']>[]>
export async function emitTailwindModules(
  modules: readonly PreparedModule<unknown>[],
  prepare: (candidates: readonly string[]) => Promise<string>,
  additionalCandidates: Iterable<string> = [],
): Promise<unknown[]> {
  return emitOwnedModules(
    [...modules],
    async (names) => {
      const context = prepareTailwindContext(await prepare(names))
      context.requireCandidates([...names])
      return context
    },
    additionalCandidates,
  )
}

/** Internal common ownership path for eager batches and session collectors. */
export async function emitCollectedModules(
  collectors: readonly (() => PreparedModule<unknown>)[],
  contextFor: (names: readonly string[]) => ContextResult,
  additionalCandidates: Iterable<string>,
  cancellation?: Cancellation,
): Promise<unknown[]> {
  const collect = [...collectors]
  const owned: PreparedModule<unknown>[] = []
  let additional: string[]
  try {
    cancellation?.check()
    additional = [...additionalCandidates]
    for (const factory of collect) {
      cancellation?.check()
      owned.push(factory())
    }
  } catch (error) {
    for (const module of owned) module.dispose()
    throw error
  }
  return emitOwnedModules(owned, contextFor, additional, cancellation)
}

async function emitOwnedModules(
  owned: PreparedModule<unknown>[],
  contextFor: (names: readonly string[]) => ContextResult,
  additional: Iterable<string>,
  cancellation?: Cancellation,
): Promise<unknown[]> {
  try {
    cancellation?.check()
    if (new Set(owned).size !== owned.length)
      throw new Error('Prepared module occurs twice in a batch')
    const candidates = Object.freeze(
      [...new Set([...additional, ...owned.flatMap((module) => module.candidates)])].sort(),
    )
    const pending = contextFor(candidates)
    const context =
      pending instanceof Promise ? await abortableContext(pending, cancellation?.signal()) : pending
    cancellation?.check()
    return owned.map((module) => {
      cancellation?.check()
      return module.emit(context)
    })
  } finally {
    for (const module of owned) module.dispose()
  }
}

/** Same one-shot ownership path, with the exact context retained for a
 * bounded publication. Ordinary/session callers keep their existing path;
 * this capture adds no callback/allocation to their per-file fast path.
 */
export async function emitTailwindContextBatch(
  modules: readonly PreparedModule<unknown>[],
  contextFor: (names: readonly string[]) => ContextResult,
  additional: Iterable<string>,
  cancellation?: Cancellation,
): Promise<{ context: PreparedTailwindContext; outputs: unknown[] }> {
  let context: PreparedTailwindContext | undefined
  const outputs = await emitOwnedModules(
    [...modules],
    (names) => {
      const save = (prepared: PreparedTailwindContext) => {
        context = prepared
        return prepared
      }
      const pending = contextFor(names)
      return pending instanceof Promise ? pending.then(save) : save(pending)
    },
    additional,
    cancellation,
  )
  cancellation?.check()
  if (!context) throw new Error('Tailwind batch did not prepare its context')
  return { context, outputs }
}

function abortableContext(
  pending: Promise<PreparedTailwindContext>,
  signal?: AbortSignal,
): Promise<PreparedTailwindContext> {
  if (!signal) return pending
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    const cleanup = () => signal.removeEventListener('abort', abort)
    // Always handle pending, even when already aborted. A late upstream
    // rejection must not become an unhandled rejection after IR is disposed.
    pending.then(
      (context) => {
        cleanup()
        resolve(context)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}
