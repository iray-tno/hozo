// Persistent project index for cross-file StyleX analysis.
//
// Candidate classes and module exports have the same owner -- the bundler's
// one complete project walk -- but not the same invalidation semantics. A
// candidate cache cares about the union of class names; an imported sheet
// cares that its defining source changed even when its exported member names
// did not. Keeping this beside rather than inside the Rust candidate snapshot
// avoids making either cache answer the other's question.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  summarizeStylexModule,
  type StylexExternalBinding,
  type StylexModuleSource,
  type StylexModuleSummary,
} from './index.ts'

const SNAPSHOT_VERSION = 1

interface FileEntry {
  modifiedMs: number
  contentHash: string
  summary: StylexModuleSummary
}

interface Snapshot {
  version: number
  files: Record<string, FileEntry>
}

export interface CachedStylexModule {
  path: string
  /** SHA-256 of the defining source, used as the Rust lowering cache key. */
  contentHash: string
  summary: StylexModuleSummary
}

function emptySnapshot(): Snapshot {
  return { version: SNAPSHOT_VERSION, files: {} }
}

function loadSnapshot(file: string): Snapshot {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as Partial<Snapshot>
    if (value.version !== SNAPSHOT_VERSION || !value.files || typeof value.files !== 'object') {
      return emptySnapshot()
    }
    return value as Snapshot
  } catch {
    // Missing, old, or interrupted cache output costs one rescan. It must
    // never cost the build: all of this is derived from authored source.
    return emptySnapshot()
  }
}

function sourceHash(source: string): string {
  return createHash('sha256').update(source).digest('hex')
}

/** Export summaries keyed by the absolute path the project walk discovered. */
export class StylexModuleCache {
  readonly #file: string
  #snapshot: Snapshot
  #dirty = false
  #sources = new Map<string, string>()

  constructor(file: string) {
    this.#file = file
    this.#snapshot = loadSnapshot(file)
  }

  isCurrent(file: string, modifiedMs: number): boolean {
    return this.#snapshot.files[file]?.modifiedMs === modifiedMs
  }

  /**
   * Analyze one source and replace its entry.
   *
   * Returns whether a consumer's answer may have changed. A touch with the
   * same bytes is not a graph change; changing an exported sheet's values is,
   * even when its public names and statuses stay identical.
   */
  scanFile(file: string, source: string, modifiedMs: number): boolean {
    const next: FileEntry = {
      modifiedMs,
      contentHash: sourceHash(source),
      // Almost every project file is not StyleX. Avoid paying for a second
      // full TS parse beside the candidate byte scan when the package name
      // is not present at all; false positives merely take the safe path.
      summary: source.includes('@stylexjs/stylex')
        ? summarizeStylexModule(source)
        : { exports: [] },
    }
    const previous = this.#snapshot.files[file]
    if (
      previous?.modifiedMs === next.modifiedMs &&
      previous.contentHash === next.contentHash
    ) {
      return false
    }
    this.#snapshot.files[file] = next
    if (next.summary.exports.length > 0) this.#sources.set(file, source)
    else this.#sources.delete(file)
    this.#dirty = true
    const hadExports = (previous?.summary.exports.length ?? 0) > 0
    const hasExports = next.summary.exports.length > 0
    return (hadExports || hasExports) && previous?.contentHash !== next.contentHash
  }

  forget(file: string): boolean {
    if (!(file in this.#snapshot.files)) return false
    const changed = this.#snapshot.files[file]!.summary.exports.length > 0
    delete this.#snapshot.files[file]
    this.#sources.delete(file)
    this.#dirty = true
    return changed
  }

  retainFiles(files: readonly string[]): number {
    const present = new Set(files)
    const missing = Object.keys(this.#snapshot.files).filter((file) => !present.has(file))
    for (const file of missing) this.forget(file)
    return missing.length
  }

  get(file: string): CachedStylexModule | undefined {
    const entry = this.#snapshot.files[file]
    return entry
      ? { path: file, contentHash: entry.contentHash, summary: entry.summary }
      : undefined
  }

  modules(): CachedStylexModule[] {
    return Object.keys(this.#snapshot.files)
      .sort()
      .flatMap((file) => {
        const entry = this.#snapshot.files[file]!
        return entry.summary.exports.length > 0
          ? [{ path: file, contentHash: entry.contentHash, summary: entry.summary }]
          : []
      })
  }

  get size(): number {
    return this.modules().length
  }

  /** Sources registered once in Rust, where their typed rules are cached. */
  moduleSources(): StylexModuleSource[] {
    return this.modules().map((module) => ({
      id: module.path,
      contentHash: module.contentHash,
      source: this.#sources.get(module.path) ?? readFileSync(module.path, 'utf8'),
    }))
  }

  /**
   * Relative ESM spellings that can name each indexed StyleX module.
   *
   * The Rust parser matches these against real import entries, so emitting
   * an unused spelling is harmless. Package aliases remain deliberately out
   * of this first slice because resolving them belongs to the bundler.
   */
  bindingsFor(importer: string): StylexExternalBinding[] {
    const bindings: StylexExternalBinding[] = []
    for (const module of this.modules()) {
      if (module.path === importer) continue
      let relative = path.relative(path.dirname(importer), module.path).replaceAll('\\', '/')
      if (!relative.startsWith('.')) relative = `./${relative}`
      const extension = path.posix.extname(relative)
      const withoutExtension = extension ? relative.slice(0, -extension.length) : relative
      const spellings = new Set([relative, withoutExtension])
      if (/\/index$/.test(withoutExtension)) {
        spellings.add(withoutExtension.slice(0, -'/index'.length) || '.')
      }
      if (['.ts', '.tsx', '.mts'].includes(extension)) {
        spellings.add(`${withoutExtension}.js`)
      }
      for (const specifier of spellings) {
        bindings.push({ specifier, moduleId: module.path })
      }
    }
    return bindings
  }

  persist(): void {
    if (!this.#dirty) return
    mkdirSync(path.dirname(this.#file), { recursive: true })
    const temporary = `${this.#file}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.#snapshot, null, 2)}\n`)
    renameSync(temporary, this.#file)
    this.#dirty = false
  }
}
