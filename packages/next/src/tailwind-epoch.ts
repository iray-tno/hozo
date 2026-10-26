// Next has a synchronous config but asynchronous loaders, in multiple worker
// processes. Own the snapshot/compiler/session together in each worker; register
// stylesheet dependencies through the loader rather than pretending to have a
// Vite-style watcher or sharing mutable Tailwind analysis between namespaces.
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { createCompiler, openCandidateCache, type Theme } from '@hozo/compiler'
import {
  CACHE_DIR,
  StylexModuleCache,
  TailwindCandidateUniverse,
  TailwindPreparationCancelled,
  TailwindProjectSession,
} from '@hozo/compiler/project'
import {
  DEFAULT_CSS_FILES,
  loadProjectClassOrder,
  loadProjectTailwindSnapshot,
  loadProjectTheme,
  type PreparedTailwindOrder,
  type ProjectTailwindSnapshot,
} from '@hozo/tailwind'
import type { HozoLoaderOptions } from './index.ts'

function stamp(files: readonly string[]) {
  return JSON.stringify(
    files.map((file) => {
      const stat = statSync(file, { throwIfNoEntry: false })
      return stat ? [stat.mtimeMs, stat.ctimeMs, stat.size, stat.ino] : null
    }),
  )
}

function discoveryPaths(options: HozoLoaderOptions) {
  return (options.css === undefined ? DEFAULT_CSS_FILES : [options.css]).map((file) =>
    path.resolve(options.root, file),
  )
}

function capturedFilesCurrent(snapshot: ProjectTailwindSnapshot, options: HozoLoaderOptions) {
  const selected = discoveryPaths(options).find((file) =>
    statSync(file, { throwIfNoEntry: false })?.isFile(),
  )
  if ((selected ?? null) !== snapshot.entry) return false
  for (const sheet of snapshot.stylesheets) {
    if (!snapshot.watchFiles.includes(sheet.file)) continue // synthetic default entry
    try {
      if (createHash('sha256').update(readFileSync(sheet.file)).digest('hex') !== sheet.sha256)
        return false
    } catch {
      return false
    }
  }
  return true
}

export class NextTailwindProject {
  readonly cache: ReturnType<typeof openCandidateCache>
  readonly stylexModules: StylexModuleCache
  readonly compiler: ReturnType<typeof createCompiler>
  readonly session: TailwindProjectSession | undefined
  readonly watchFiles: readonly string[]
  readonly missingFiles: ReadonlySet<string>
  readonly theme: Theme | undefined
  stylexGraphResolved = false
  classOrder: string[] = []
  candidateDirty = true
  universe: TailwindCandidateUniverse
  #snapshot: ProjectTailwindSnapshot | undefined
  #names: Set<string>
  #stamp: string
  #closed = false
  #requests = new Map<string, symbol>()
  #last: { key: string; value: Promise<PreparedTailwindOrder> } | undefined
  #serial: Promise<unknown> = Promise.resolve()
  #orderedUniverse: TailwindCandidateUniverse | undefined

  constructor(
    options: HozoLoaderOptions,
    snapshot: ProjectTailwindSnapshot | undefined,
    theme: Theme | undefined,
  ) {
    this.#snapshot = snapshot
    this.theme = theme
    this.watchFiles = snapshot?.watchFiles ?? discoveryPaths(options)
    this.missingFiles = new Set(
      this.watchFiles.filter((file) => !statSync(file, { throwIfNoEntry: false })),
    )
    this.#stamp = stamp(this.watchFiles)
    this.cache = openCandidateCache(
      path.join(options.root, CACHE_DIR, 'candidates.json'),
      options.sources,
    )
    this.stylexModules = new StylexModuleCache(
      path.join(options.root, CACHE_DIR, 'stylex-modules.json'),
    )
    this.compiler = createCompiler(theme, options.sources, options.fontAvailability)
    this.compiler.setStylexModules(this.stylexModules.moduleSources())
    this.#names = new Set([...(options.orderingCandidates ?? []), ...this.cache.candidates()])
    this.universe = new TailwindCandidateUniverse(this.#names)
    if (snapshot) {
      this.session = new TailwindProjectSession(this.compiler, async (names, signal) => {
        const prepared = await this.order(names)
        this.check()
        signal.throwIfAborted()
        return JSON.stringify(prepared.snapshot)
      })
    }
  }

  isCurrent() {
    return !this.#closed && stamp(this.watchFiles) === this.#stamp
  }

  check() {
    if (this.#closed) throw new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED')
  }

  checkDependencies() {
    if (!this.isCurrent()) this.invalidate()
    this.check()
  }

  start(id: string) {
    const ticket = Symbol(id)
    this.#requests.set(id, ticket)
    return {
      check: () => {
        this.check()
        if (this.#requests.get(id) !== ticket)
          throw new TailwindPreparationCancelled('TAILWIND_MODULE_SUPERSEDED')
      },
      finish: () => {
        if (this.#requests.get(id) === ticket) this.#requests.delete(id)
      },
    }
  }

  observe(names: Iterable<string>) {
    let changed = false
    for (const name of names) {
      if (!this.#names.has(name)) {
        this.#names.add(name)
        changed = true
      }
    }
    if (changed) {
      this.universe = new TailwindCandidateUniverse(this.#names)
      this.candidateDirty = true
    }
    return changed
  }

  private order(names: readonly string[]) {
    this.check()
    const key = JSON.stringify(names)
    if (this.#last?.key === key) return this.#last.value
    const observed = [...names]
    const value = this.#serial.then(async () => {
      this.check()
      const result = await this.#snapshot!.prepareOrder(observed)
      this.check()
      return result
    })
    this.#last = { key, value }
    this.#serial = value.catch(() => {})
    void value.catch(() => {
      if (this.#last?.value === value) this.#last = undefined
    })
    return value
  }

  async refreshOrder(options: HozoLoaderOptions) {
    this.check()
    if (this.#orderedUniverse === this.universe) return
    for (;;) {
      const revision = this.universe
      const prepared = this.#snapshot ? await this.order(revision.candidates) : undefined
      const order = prepared
        ? [...revision.candidates].sort((a, b) => {
            const left = prepared.lookup(a)?.firstRuleRank,
              right = prepared.lookup(b)?.firstRuleRank
            if (left == null) return right == null ? 0 : 1
            if (right == null) return -1
            return BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0
          })
        : await loadProjectClassOrder(options.root, this.cache.candidates(), {
            css: options.css,
            fresh: true,
          })
      this.check()
      if (revision !== this.universe) continue
      this.classOrder = order
      this.#orderedUniverse = revision
      return
    }
  }

  invalidate() {
    this.#closed = true
    this.session?.invalidate()
    this.#last = undefined
    this.#orderedUniverse = undefined
    this.#requests.clear()
  }
}

type Entry = {
  key: string
  closed: boolean
  value?: NextTailwindProject
  work: Promise<NextTailwindProject>
}
const projects = new Map<string, Entry>()

async function openProject(options: HozoLoaderOptions) {
  let snapshot: ProjectTailwindSnapshot | undefined
  let theme: Theme | undefined
  try {
    snapshot = await loadProjectTailwindSnapshot(options.root, { css: options.css })
    theme = snapshot.theme
  } catch (error) {
    if (error instanceof TailwindPreparationCancelled) throw error
    console.warn(
      `[hozo] ordering snapshot unavailable; using existing lowering: ${(error as Error).message}`,
    )
    theme = await loadProjectTheme(options.root, {
      css: options.css,
      fresh: true,
      warn: console.warn,
    })
  }
  const value = new NextTailwindProject(options, snapshot, theme)
  // Capture the metadata stamp before validating bytes: otherwise an edit
  // between validation and construction could bless old CSS with a new stamp.
  if (snapshot && (!capturedFilesCurrent(snapshot, options) || !value.isCurrent())) {
    value.invalidate()
    throw new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED')
  }
  await value.refreshOrder(options)
  return value
}

/** Reuse only a matching, still-current worker epoch. A changed config or
 * dependency stamp retires its compiler and pending results as one unit.
 */
export async function nextTailwindProject(options: HozoLoaderOptions) {
  // The config hashes its copied full seed once, not a project-sized
  // stringify on every warm module. Actual parse completeness is still checked.
  const key = options.orderingKey ?? JSON.stringify(options)
  for (;;) {
    let entry = projects.get(options.root)
    if (entry && entry.key !== key) {
      entry.closed = true
      entry.value?.invalidate()
      projects.delete(options.root)
      entry = undefined
    }
    if (!entry) {
      const next: Entry = {
        key,
        closed: false,
        work: openProject(options).then((value) => {
          if (next.closed) {
            value.invalidate()
            throw new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED')
          }
          next.value = value
          return value
        }),
      }
      projects.set(options.root, next)
      entry = next
      void next.work.catch(() => {
        if (projects.get(options.root) === next) projects.delete(options.root)
      })
    }
    const value = await entry.work
    if (projects.get(options.root) !== entry) continue
    if (value.isCurrent()) return value
    entry.closed = true
    value.invalidate()
    projects.delete(options.root)
  }
}
