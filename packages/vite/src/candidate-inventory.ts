// Build-only source facts. This inventory is not a stylesheet, a rule-order
// namespace, or permission to publish a partial candidate union.
import { createHash, randomUUID } from 'node:crypto'
import { type CandidateCache, openCandidateCache } from '@hozo/compiler'
import {
  type CandidateContribution,
  type ExpectedCandidateSource,
  reconcileRuntimeCandidateContributions,
} from '@hozo/compiler/project'

export const candidateMetaKey = 'hozo:runtime-candidates'

export function contentRevision(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

interface ModuleReceipt {
  schema: 1
  id: string
  environment: string
  inputRevision: string
  record: string
  producer: string
  outputRevision?: string
}

export interface CandidateGraphModule {
  id: string
  code: string | null
  meta: Record<string, unknown>
}

function receipt(value: unknown): ModuleReceipt | undefined {
  if (!value || typeof value !== 'object') return
  const row = value as Partial<ModuleReceipt>
  if (
    row.schema !== 1 ||
    typeof row.id !== 'string' ||
    typeof row.environment !== 'string' ||
    typeof row.inputRevision !== 'string' ||
    typeof row.record !== 'string' ||
    typeof row.producer !== 'string'
  )
    return
  return row as ModuleReceipt
}

function moduleId(environment: string, id: string): string {
  return JSON.stringify(['module', environment, id])
}

/** @internal One build/environment, with the bundler owning the final ID set.
 * The receipt travels with transform metadata. A fresh producer may seal it
 * against moduleParsed's final code, after downstream transforms; a replayed
 * receipt must already match that code and must never be silently resealed.
 */
export class ViteCandidateInventory {
  private readonly producer = randomUUID()
  private readonly fresh = new Map<string, ModuleReceipt>()
  private readonly authored: CandidateContribution[] = []
  private derived: CandidateCache | undefined
  private readonly environment: string
  private readonly sources?: readonly string[]

  constructor(environment: string, sources?: readonly string[]) {
    this.environment = environment
    this.sources = sources
  }

  observeAuthored(id: string, code: string, record: string | null) {
    if (record !== null) this.authored.push({ id, revision: contentRevision(code), record })
  }

  transformMeta(id: string, input: string, record: string) {
    const row: ModuleReceipt = {
      schema: 1,
      id,
      environment: this.environment,
      inputRevision: contentRevision(input),
      record,
      producer: this.producer,
    }
    this.fresh.set(id, { ...row })
    return { [candidateMetaKey]: row }
  }

  transformDerivedMeta(id: string, input: string) {
    // Query modules are not the physical authored file. Use the same native
    // scanner/policy, but never overwrite or persist that file's cache entry.
    // Only the opaque receipt survives; the scratch scan has no project-sized
    // lifetime candidate union and is shared only across synchronous calls.
    const cache = (this.derived ??= openCandidateCache(undefined, this.sources))
    try {
      cache.scanFile(id, input, 0)
      const record = cache.exportFile(id)
      return record === null ? undefined : this.transformMeta(id, input, record)
    } finally {
      cache.forget(id)
    }
  }

  moduleParsed(module: CandidateGraphModule) {
    const row = receipt(module.meta[candidateMetaKey])
    const fresh = this.fresh.get(module.id)
    if (
      !row ||
      !fresh ||
      row.producer !== this.producer ||
      row.id !== module.id ||
      row.environment !== this.environment ||
      row.inputRevision !== fresh.inputRevision ||
      row.record !== fresh.record ||
      typeof module.code !== 'string'
    )
      return
    // Do not depend on metadata preserving JS object identity across the
    // native bundler boundary. Replace through its documented meta object.
    module.meta[candidateMetaKey] = { ...row, outputRevision: contentRevision(module.code) }
    this.fresh.delete(module.id)
  }

  reconcile(
    authored: readonly ExpectedCandidateSource[],
    modules: readonly CandidateGraphModule[],
  ) {
    const expected = [...authored]
    const observations = [...this.authored]
    const proofIssues: { id: string; kind: string }[] = []
    for (const module of modules) {
      const id = moduleId(this.environment, module.id)
      const row = receipt(module.meta[candidateMetaKey])
      if (
        !row ||
        row.id !== module.id ||
        row.environment !== this.environment ||
        !row.inputRevision ||
        typeof module.code !== 'string' ||
        row.outputRevision !== contentRevision(module.code)
      ) {
        proofIssues.push({ id, kind: 'missing-or-mismatched-output-receipt' })
        continue
      }
      expected.push({ id, revision: row.inputRevision })
      observations.push({ id, revision: row.inputRevision, record: row.record })
    }
    const result = reconcileRuntimeCandidateContributions(expected, observations, this.sources)
    const issues = [...(result.status === 'incomplete' ? result.issues : []), ...proofIssues].sort(
      (a, b) => a.id.localeCompare(b.id),
    )
    return {
      schema: 1,
      scope: 'runtime-source-facts',
      environment: this.environment,
      status: issues.length ? 'incomplete' : 'complete',
      // No consumers should confuse the source-fact union with complete
      // static/actual compiler units or a final compiled-output namespace.
      finalOrderingReady: false,
      authoredValidation: 'content-revision-with-native-policy-and-mtime-cache',
      authored: authored.map((entry) => entry.id).sort(),
      modules: modules.map((entry) => entry.id).sort(),
      accepted: result.accepted,
      ignored: result.ignored,
      issues,
      ...(result.status === 'complete' && issues.length === 0
        ? { candidates: result.cache.candidates(), usesTailwind: result.cache.usesTailwind }
        : {}),
    }
  }
}
