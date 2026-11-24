// Stylesheet epoch, candidate universe, companion CSS output, and dev-server
// invalidation for one Vite plugin instance.

import path from 'node:path'
import type { CandidateCache } from '@hozo/compiler'
import {
  type HozoProjectOptions,
  preflightCssPath,
  type StylexModuleCache,
  TailwindCandidateUniverse,
  TailwindPreparationCancelled,
  webBaseCssFor,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { preflightCss } from '@hozo/tailwind'
import type { ViteDevServer } from 'vite'
import { discoveryPaths, openViteTailwindEpoch, type ViteTailwindEpoch } from './tailwind-epoch.ts'

export class ViteStylesheetSession {
  readonly #options: HozoProjectOptions
  #server: ViteDevServer | undefined
  #cache: CandidateCache | undefined
  #candidateCssPath = ''
  #preflightPath = ''
  #preflight = ''
  // The candidate order Tailwind would use, refreshed whenever the set
  // changes. Held rather than recomputed per write because the write path
  // is synchronous and this is not: `getClassOrder` needs the project's
  // design system.
  #classOrder: string[] = []
  #epoch: ViteTailwindEpoch | undefined
  #pendingEpoch: Promise<ViteTailwindEpoch> | undefined
  #epochGeneration = 0
  #candidateGeneration = 0
  #universe = new TailwindCandidateUniverse([])
  #sheetUniverseKey = ''
  readonly #orderingSources = new Map<string, { file: string; names: readonly string[] }>()
  readonly #transformedIds = new Set<string>()

  constructor(options: HozoProjectOptions) {
    this.#options = options
  }

  get cache(): CandidateCache {
    return this.#cache!
  }

  get epoch(): ViteTailwindEpoch | undefined {
    return this.#epoch
  }

  get universe(): TailwindCandidateUniverse {
    return this.#universe
  }

  get sheetUniverseKey(): string {
    return this.#sheetUniverseKey
  }

  get candidateCssPath(): string {
    return this.#candidateCssPath
  }

  get preflightPath(): string {
    return this.#preflightPath
  }

  setServer(server: ViteDevServer) {
    this.#server = server
  }

  invalidateEpoch() {
    this.#epochGeneration++
    this.#epoch?.invalidate()
    this.#epoch = undefined
    this.#pendingEpoch = undefined
  }

  resetForClose() {
    this.invalidateEpoch()
    this.#transformedIds.clear()
    this.#orderingSources.clear()
  }

  initProject(dir: string, cache: CandidateCache) {
    this.#cache = cache
    this.#orderingSources.clear()
    this.#candidateCssPath = path.join(dir, 'candidates.css')
    this.#preflightPath = preflightCssPath(dir)
    // Read once for the process rather than per write: it is a file on disk
    // that cannot change under a running build.
    this.#preflight = preflightCss()
  }

  persistCache() {
    this.#cache?.persist()
  }

  recordTransformed(id: string) {
    this.#transformedIds.add(id)
  }

  rememberCandidates(key: string, file: string, names: readonly string[]): boolean {
    const normalized = [...new Set(names)].sort()
    if (JSON.stringify(this.#orderingSources.get(key)?.names) === JSON.stringify(normalized))
      return false
    this.#orderingSources.set(key, { file: path.resolve(file), names: normalized })
    return true
  }

  updateUniverse(): boolean {
    const next = new TailwindCandidateUniverse([
      ...this.#cache!.candidates(),
      ...[...this.#orderingSources.values()].flatMap((entry) => entry.names),
    ])
    if (next.key === this.#universe.key) return false
    this.#universe = next
    return true
  }

  async currentEpoch(
    root: string,
    warn: (message: string) => void,
    stylexModules?: StylexModuleCache,
  ): Promise<ViteTailwindEpoch> {
    if (this.#epoch) return this.#epoch
    if (!this.#pendingEpoch) {
      const generation = this.#epochGeneration
      this.#pendingEpoch = openViteTailwindEpoch(root, this.#options, warn).then((next) => {
        if (generation !== this.#epochGeneration) {
          next.invalidate()
          throw new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED')
        }
        if (!next.isCurrent()) {
          next.invalidate()
          this.#pendingEpoch = undefined
          return this.currentEpoch(root, warn, stylexModules)
        }
        if (stylexModules) next.compiler.setStylexModules(stylexModules.moduleSources())
        this.#epoch = next
        return next
      })
      const pending = this.#pendingEpoch
      void pending.catch(() => {
        if (this.#pendingEpoch === pending) this.#pendingEpoch = undefined
      })
    }
    return this.#pendingEpoch
  }

  async refreshCandidates(
    root: string,
    warn: (message: string) => void,
    stylexModules?: StylexModuleCache,
    onBeforePublish?: () => void,
  ) {
    for (;;) {
      const generation = ++this.#candidateGeneration
      const nextUniverse = this.#universe
      const current = await this.currentEpoch(root, warn, stylexModules)
      const next = await current.classOrder(nextUniverse.candidates)
      current.check()
      if (generation !== this.#candidateGeneration) return
      if (nextUniverse.key !== this.#universe.key) continue
      onBeforePublish?.()
      this.#classOrder = next
      this.#sheetUniverseKey = nextUniverse.key
      this.writeCandidateCss()
      return
    }
  }

  invalidateTransforms() {
    if (!this.#server) return
    for (const environment of Object.values(this.#server.environments)) {
      for (const id of this.#transformedIds) {
        const module = environment.moduleGraph.getModuleById(id)
        if (module) environment.moduleGraph.invalidateModule(module)
      }
    }
    this.#server.ws.send({ type: 'full-reload' })
  }

  /**
   * Regenerates the project-wide candidate stylesheet and, in dev, makes the
   * already-loaded module pick it up. The file lives under `node_modules`,
   * which Vite's watcher ignores by default, so the invalidation has to be
   * explicit rather than left to the watcher.
   */
  writeCandidateCss(): boolean {
    // Before the invalidation below, not after: the two stylesheets are one
    // update, and a reload that saw only half of it would be a page styled
    // against the previous answer.
    this.writePreflightCss()
    if (
      !writeFileIfChanged(
        this.#candidateCssPath,
        this.#cache!.renderCss(this.#epoch?.theme, this.#classOrder),
      )
    )
      return false
    const module = this.#server?.moduleGraph.getModuleById(this.#candidateCssPath)
    if (module) {
      void this.#server?.reloadModule(module)
    }
    return true
  }

  /**
   * The base layer Tailwind's utilities are authored against, which Hozo does
   * not otherwise ship. Written on the same terms as the candidate stylesheet
   * -- always present, contents decided by the option and by whether the
   * project uses Tailwind at all -- and invalidated the same way, since it
   * lives under `node_modules` where the watcher does not look.
   */
  writePreflightCss() {
    const css = webBaseCssFor(
      this.#options.fontFaceCss,
      this.#options.preflight,
      this.#preflight,
      this.#cache!.usesTailwind,
    )
    if (!writeFileIfChanged(this.#preflightPath, css)) return
    const module = this.#server?.moduleGraph.getModuleById(this.#preflightPath)
    if (module) {
      void this.#server?.reloadModule(module)
    }
  }

  dropOrderingForFile(absolute: string, isDelete: boolean): boolean {
    let changed = false
    for (const [key, entry] of this.#orderingSources) {
      // Keep the lexical seed until the replacement source arrives: an
      // unrelated code edit should not drop/re-add every static name and
      // rebuild the whole project's namespace twice.
      if (entry.file === absolute && (isDelete || key.startsWith('["actual",'))) {
        this.#orderingSources.delete(key)
        changed = true
      }
    }
    return changed
  }

  isStylesheetDependency(absolute: string, root: string): boolean {
    // Dependencies can sit outside the project. During acquisition,
    // conservatively invalidate root CSS edits before imports are known.
    const dependency =
      this.#epoch?.watchFiles.includes(absolute) ??
      discoveryPaths(root, this.#options.css).includes(absolute)
    return (
      dependency ||
      (!this.#epoch?.snapshot &&
        path.extname(absolute) === '.css' &&
        !absolute.endsWith('.hozo.css') &&
        absolute !== this.#candidateCssPath &&
        absolute !== this.#preflightPath)
    )
  }

  forgetDeletedFile(absolute: string): boolean {
    for (const moduleId of this.#transformedIds) {
      if (path.resolve(moduleId.split('?')[0]!) === absolute) this.#transformedIds.delete(moduleId)
    }
    return this.#cache?.forget(absolute) ?? false
  }
}
