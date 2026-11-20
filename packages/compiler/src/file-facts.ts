// One record of what a file tells the build about itself (decision 014).
//
// Every fact here is derived from one file's source alone, produced by
// `fileFacts` in one read, and stored once, keyed by path and current by
// mtime. Channels that cross files -- the ordering seed, class helpers,
// project text forwarding -- are derived from these records, never by
// reading source again. A new cross-file fact is a new field on `FileFacts`.
//
// Candidate facts and StyleX summaries keep their own stores
// (`candidates.json`, `stylex-modules.json`): they come from the same read,
// are keyed the same way, and other processes open them directly. Decision
// 014 records why one Rust parse for every fact was not worth taking.

import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  classHelperCandidates,
  inspectStaticModuleImports,
  scanTailwindOrderCandidates,
  summarizeClassHelperMerges,
  summarizeClassHelpers,
  summarizeTextForwarding,
  type TextForwardingSummary,
} from './index.ts'

/** Bumped when a field is added or changes meaning; older records are recomputed. */
export const FILE_FACTS_SCHEMA = 1

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/

export interface FileFacts {
  modifiedMs: number
  contentHash: string
  /** Every name Tailwind could order, for the project ordering seed. */
  order: string[]
  /** Static import specifiers, as written. Script files only. */
  imports: string[]
  /** Whether the source mentions `className` at all; Metro looks for helpers only then. */
  mentionsClassName: boolean
  /** The imports that could be class helpers (#964). */
  helperImports: { specifier: string; imported: string }[]
  /** What this file exports as a class joiner, and which of those merge. */
  helperExports: string[]
  helperMerges: string[]
  /** What this file's components hand a nested Text, and its re-exports. */
  textForwarding: TextForwardingSummary
}

const NOTHING_FORWARDED: TextForwardingSummary = { components: [], reexports: [] }

// Each producer is the one the separate passes called. A source a parser
// refuses gives that fact nothing, as the passes did.
function attempt<T>(produce: () => T, fallback: T): T {
  try {
    return produce()
  } catch {
    return fallback
  }
}

/** Everything the build derives from this one source, from one read. */
export function fileFacts(file: string, source: string, modifiedMs: number): FileFacts {
  const script = SCRIPT.test(file)
  return {
    modifiedMs,
    contentHash: createHash('sha256').update(source).digest('hex'),
    order: scanTailwindOrderCandidates(source),
    imports: script
      ? attempt(
          () => [
            ...new Set(
              inspectStaticModuleImports(source, file).bindings.map((binding) => binding.source),
            ),
          ],
          [],
        )
      : [],
    mentionsClassName: source.includes('className'),
    helperImports: attempt(() => classHelperCandidates(source), []),
    helperExports: script ? attempt(() => summarizeClassHelpers(source), []) : [],
    helperMerges: script ? attempt(() => summarizeClassHelperMerges(source), []) : [],
    textForwarding: script
      ? attempt(() => summarizeTextForwarding(source), NOTHING_FORWARDED)
      : NOTHING_FORWARDED,
  }
}

interface Snapshot {
  schema: number
  files: Record<string, FileFacts>
}

/**
 * The records, by absolute path. Persisted beside the candidate cache when
 * given a file; in memory otherwise.
 */
export class FileFactStore {
  readonly #file: string | undefined
  #files: Record<string, FileFacts>
  #dirty = false
  #reads = 0

  constructor(file?: string) {
    this.#file = file
    let files: Record<string, FileFacts> = {}
    if (file) {
      try {
        const snapshot = JSON.parse(readFileSync(file, 'utf8')) as Snapshot
        if (snapshot.schema === FILE_FACTS_SCHEMA && snapshot.files) files = snapshot.files
      } catch {
        // Missing or unreadable: every record is recomputed.
      }
    }
    this.#files = files
  }

  /** Sources this store has read itself, for a test that a channel did not read again. */
  get reads(): number {
    return this.#reads
  }

  isCurrent(file: string, modifiedMs: number): boolean {
    return this.#files[path.resolve(file)]?.modifiedMs === modifiedMs
  }

  /** Records a source the caller already read. */
  record(file: string, source: string, modifiedMs: number): FileFacts {
    const key = path.resolve(file)
    const previous = this.#files[key]
    const next = fileFacts(key, source, modifiedMs)
    if (previous?.modifiedMs !== modifiedMs || previous.contentHash !== next.contentHash) {
      this.#files[key] = next
      this.#dirty = true
    }
    return this.#files[key]!
  }

  /**
   * The current record of any file, read only when it changed: a helper or
   * forwarding component outside the walk gets one the same way.
   */
  get(file: string): FileFacts | undefined {
    const key = path.resolve(file)
    const stat = statSync(key, { throwIfNoEntry: false })
    if (!stat?.isFile()) return undefined
    const cached = this.#files[key]
    if (cached?.modifiedMs === stat.mtimeMs) return cached
    let source: string
    try {
      source = readFileSync(key, 'utf8')
    } catch {
      return undefined
    }
    this.#reads++
    return this.record(key, source, stat.mtimeMs)
  }

  /** Drops records of walked files that are gone; a record outside the walk stays until its file does. */
  retainFiles(walked: readonly string[]): number {
    const present = new Set(walked.map((file) => path.resolve(file)))
    let removed = 0
    for (const file of Object.keys(this.#files)) {
      if (present.has(file)) continue
      if (statSync(file, { throwIfNoEntry: false })?.isFile()) continue
      delete this.#files[file]
      removed++
    }
    if (removed > 0) this.#dirty = true
    return removed
  }

  persist(): void {
    if (!this.#file || !this.#dirty) return
    const snapshot: Snapshot = { schema: FILE_FACTS_SCHEMA, files: this.#files }
    writeFileSync(this.#file, JSON.stringify(snapshot))
    this.#dirty = false
  }
}
