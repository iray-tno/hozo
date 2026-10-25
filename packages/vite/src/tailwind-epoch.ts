// The Vite lifecycle, not a second Tailwind resolver. One compiler/session
// uses one captured stylesheet graph. A closed epoch can never deliver code.

import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { type Compiler, createCompiler, type Theme } from '@hozo/compiler'
import { TailwindPreparationCancelled, TailwindProjectSession } from '@hozo/compiler/project'
import {
  DEFAULT_CSS_FILES,
  loadProjectClassOrder,
  loadProjectTailwindSnapshot,
  loadProjectTheme,
  type PreparedTailwindOrder,
  type ProjectTailwindSnapshot,
} from '@hozo/tailwind'
import type { HozoOptions } from './index.ts'

export class ViteTailwindEpoch {
  readonly root: string
  readonly options: HozoOptions
  readonly snapshot: ProjectTailwindSnapshot | undefined
  readonly compiler: Compiler
  readonly theme: Theme | undefined
  readonly watchFiles: readonly string[]
  readonly session: TailwindProjectSession | undefined
  #closed = false
  #last: { key: string; value: Promise<PreparedTailwindOrder> } | undefined
  #serial: Promise<unknown> = Promise.resolve()

  constructor(
    root: string,
    options: HozoOptions,
    snapshot: ProjectTailwindSnapshot | undefined,
    theme: Theme | undefined,
  ) {
    this.root = root
    this.options = options
    this.snapshot = snapshot
    this.theme = theme
    this.compiler = createCompiler(theme, options.sources, options.fontAvailability)
    this.watchFiles = snapshot?.watchFiles ?? discoveryPaths(root, options.css)
    if (snapshot) {
      this.session = new TailwindProjectSession(this.compiler, async (names, signal) => {
        const order = await this.order(names)
        signal.throwIfAborted()
        return JSON.stringify(order.snapshot)
      })
    }
  }

  check() {
    if (this.#closed) throw new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED')
  }

  /** Validate once before adoption, not on warm transforms. A filesystem
   * edit during async capture must not install an already-obsolete graph.
   */
  isCurrent(): boolean {
    if (!this.snapshot) return true
    let selected: string | undefined
    for (const file of discoveryPaths(this.root, this.options.css)) {
      const stat = statSync(file, { throwIfNoEntry: false })
      if (!stat) continue
      if (!stat.isFile()) return false
      selected = file
      break
    }
    if ((selected ?? null) !== this.snapshot.entry) return false
    for (const sheet of this.snapshot.stylesheets) {
      // The defaults receipt includes a synthetic entry, not a disk read.
      if (!this.watchFiles.includes(sheet.file)) continue
      try {
        if (createHash('sha256').update(readFileSync(sheet.file)).digest('hex') !== sheet.sha256)
          return false
      } catch {
        return false
      }
    }
    return true
  }

  invalidate() {
    this.#closed = true
    this.session?.invalidate()
    this.#last = undefined
  }

  async classOrder(names: readonly string[]): Promise<string[]> {
    this.check()
    if (!this.snapshot) {
      const order = await loadProjectClassOrder(this.root, names, {
        css: this.options.css,
        fresh: true,
      })
      this.check()
      return order
    }
    const prepared = await this.order(names)
    this.check()
    return [...names].sort((a, b) => {
      const left = prepared.lookup(a)?.firstRuleRank
      const right = prepared.lookup(b)?.firstRuleRank
      if (left == null) return right == null ? 0 : 1
      if (right == null) return -1
      const x = BigInt(left),
        y = BigInt(right)
      return x < y ? -1 : x > y ? 1 : 0
    })
  }

  private order(names: readonly string[]): Promise<PreparedTailwindOrder> {
    this.check()
    const observed = [...new Set(names)].sort()
    const key = JSON.stringify(observed)
    if (this.#last?.key === key) return this.#last.value
    const value = this.#serial.then(async () => {
      this.check()
      const result = await this.snapshot!.prepareOrder(observed)
      this.check()
      return result
    })
    this.#last = { key, value }
    this.#serial = value.catch(() => {})
    // A rejected preparation must not poison future requests in this epoch.
    void value.catch(() => {
      if (this.#last?.value === value) this.#last = undefined
    })
    return value
  }
}

export const discoveryPaths = (root: string, css?: string) =>
  (css === undefined ? DEFAULT_CSS_FILES : [css]).map((file) => path.resolve(root, file))

export async function openViteTailwindEpoch(
  root: string,
  options: HozoOptions,
  warn: (message: string) => void,
) {
  let snapshot: ProjectTailwindSnapshot | undefined
  let theme: Theme | undefined
  try {
    snapshot = await loadProjectTailwindSnapshot(root, { css: options.css })
    theme = snapshot.theme
  } catch (error) {
    // Preserve the existing build fallback for unassessed/broken stylesheets.
    // Never manufacture a canonical context from defaults for that project.
    const warnings: string[] = []
    theme = await loadProjectTheme(root, {
      css: options.css,
      fresh: true,
      warn: (message) => warnings.push(message),
    })
    if (warnings.length) warnings.forEach(warn)
    else
      warn(
        `[hozo] ordering snapshot unavailable; using existing lowering: ${(error as Error).message}`,
      )
  }
  return new ViteTailwindEpoch(root, options, snapshot, theme)
}
