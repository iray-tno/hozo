// Own live continuations until Vite declares its actual graph, never guess
// graph membership from the authored walk or serialize a native IR handle.
import type { Theme } from '@hozo/compiler'
import type { WebStyleContinuation } from '@hozo/compiler/lower'
import { emitFinalTailwindBatch, TailwindBatchIncomplete } from '@hozo/compiler/project'
import {
  candidateModuleId,
  contentRevision,
  type ViteCandidateInventory,
} from './candidate-inventory.ts'

const boundary = {
  schema: 1,
  scope: 'static-final-styles',
  bundleOutputPolicy: 'passthrough',
  bundleValidation: 'not-assessed',
  // Static finalization is not final candidate CSS or activation in assets.
  finalOrderingReady: false,
} as const

interface Pending {
  id: string
  revision: string
  module: WebStyleContinuation['module']
}

export const finalStylesState = (status: 'collecting' | 'failed' | 'unavailable') => ({
  ...boundary,
  status,
})

export class ViteFinalStyleGraph {
  private pending = new Map<string, Pending>()
  private abort = new AbortController()
  private finished = false
  private readonly environment: string

  constructor(environment: string) {
    this.environment = environment
  }

  observe(id: string, input: string, continuation: WebStyleContinuation) {
    if (this.finished) {
      continuation.module.dispose()
      throw new Error('Vite final style graph has already closed')
    }
    this.pending.get(id)?.module.dispose()
    this.pending.set(id, {
      id: candidateModuleId(this.environment, id),
      revision: contentRevision(input),
      module: continuation.module,
    })
  }

  async publish(
    modules: readonly { id: string }[],
    runtime: ReturnType<ViteCandidateInventory['publicationInputs']>,
    prepare: (names: readonly string[], signal?: AbortSignal) => Promise<string>,
    theme: Theme | undefined,
    current: () => boolean,
  ) {
    if (this.finished) throw new Error('Vite final style graph has already closed')
    this.finished = true
    try {
      const issues: { id: string; kind: string }[] = [...runtime.issues]
      const runtimeRevisions = new Map(runtime.expected.map(({ id, revision }) => [id, revision]))
      const expected = modules.map(({ id }) => {
        const key = candidateModuleId(this.environment, id)
        const row = this.pending.get(id)
        const revision = runtimeRevisions.get(key)
        // Cached transform metadata is not a live native continuation. Do not
        // invent a cache hook/reparse, or call the graph ready on that basis.
        if (!row) issues.push({ id: key, kind: 'missing-live-continuation' })
        else if (row.revision !== revision)
          issues.push({ id: key, kind: 'stale-live-continuation' })
        return { id: key, revision: revision ?? '' }
      })
      if (!current()) issues.push({ id: '', kind: 'stylesheet-epoch-changed' })
      if (issues.length) return { ...boundary, status: 'incomplete', issues }
      const collected = [...this.pending.values()]
      const publication = emitFinalTailwindBatch({
        expected,
        collected,
        runtime,
        theme,
        signal: this.abort.signal,
        async prepare(names, signal) {
          const snapshot = await prepare(names, signal)
          if (!current()) throw new Error('Vite stylesheet epoch changed during final publication')
          return snapshot
        },
      })
      // The common publisher now owns all handles, including absent modules.
      this.pending.clear()
      const final = await publication
      if (!current())
        throw new Error('Vite stylesheet epoch changed before final publication delivery')
      const styles = final.modules.flatMap(({ id, revision, output }) =>
        output
          ? [
              {
                id,
                revision,
                css: output.css,
                cssPath: output.cssPath,
                hozoCodeRevision: contentRevision(output.code),
              },
            ]
          : [],
      )
      return {
        ...boundary,
        status: 'complete',
        staticOrderingReady: true,
        fingerprint: final.fingerprint,
        nativePlanFingerprint: final.native.fingerprint,
        candidates: final.candidates,
        modules: expected,
        styles,
        ignoredModules: final.ignoredModules,
        ignoredRuntimeSources: final.ignoredRuntimeSources,
      }
    } catch (error) {
      if (error instanceof TailwindBatchIncomplete) {
        const issues: { id: string; kind: string; message?: string }[] = error.issues.map(
          ({ id, kind, message }) => ({ id, kind, ...(message === undefined ? {} : { message }) }),
        )
        return { ...boundary, status: 'incomplete', issues }
      }
      throw error
    } finally {
      this.dispose()
    }
  }

  dispose() {
    this.finished = true
    this.abort.abort(new Error('Vite final style graph retired'))
    for (const { module } of this.pending.values()) module.dispose()
    this.pending.clear()
  }
}
