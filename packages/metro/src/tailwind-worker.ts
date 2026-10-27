import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Compiler } from '@hozo/compiler'
import {
  type StylexModuleCache,
  TailwindCandidateUniverse,
  TailwindProjectSession,
} from '@hozo/compiler/project'
import { restoreTailwindStylesheet } from '@hozo/tailwind'
import type { MetroTailwindReference } from './project.ts'
import { transformHozoSourceOrPrepare } from './transform.ts'

/** Read once per worker/epoch. A broken transfer is an error, not permission
 * to re-read newer CSS beside an older generated project candidate module.
 */
export async function readTailwindTransfer(reference: MetroTailwindReference) {
  const content = readFileSync(reference.file, 'utf8')
  if (createHash('sha256').update(content).digest('hex') !== reference.sha256) {
    throw new Error('[hozo] Metro Tailwind snapshot hash mismatch; restart Metro')
  }
  const data = JSON.parse(content)
  if (
    data?.schema !== 1 ||
    data.orderingPolicy !== 'scalar-order-v1' ||
    typeof data.stylesheet !== 'string' ||
    !Array.isArray(data.candidates) ||
    data.candidates.some((name: unknown) => typeof name !== 'string')
  ) {
    throw new Error('[hozo] Invalid Metro Tailwind snapshot; restart Metro')
  }
  return {
    snapshot: await restoreTailwindStylesheet(data.stylesheet),
    candidates: data.candidates as string[],
  }
}

/** One platform's compiler/session, never shared mutable StyleX bindings
 * between iOS, Android and Web while an async preparation is suspended.
 */
export class MetroTailwindWorker {
  readonly compiler: Compiler
  readonly session: TailwindProjectSession
  #names: Set<string>
  #universe: TailwindCandidateUniverse

  constructor(compiler: Compiler, transfer: Awaited<ReturnType<typeof readTailwindTransfer>>) {
    this.compiler = compiler
    this.#names = new Set(transfer.candidates)
    this.#universe = new TailwindCandidateUniverse(this.#names)
    this.session = new TailwindProjectSession(compiler, async (names, signal) =>
      JSON.stringify((await transfer.snapshot.prepareOrder(names, signal)).snapshot),
    )
  }

  transform(source: string, filename: string, root: string, stylexModules?: StylexModuleCache) {
    return this.session.runModule(
      path.resolve(root, filename),
      this.#universe,
      (compiler, context) => {
        const result = transformHozoSourceOrPrepare(
          source,
          filename,
          root,
          compiler,
          context,
          stylexModules,
        )
        if (result.kind === 'prepared') {
          let changed = false
          for (const name of result.module.candidates) {
            if (!this.#names.has(name)) {
              this.#names.add(name)
              changed = true
            }
          }
          // Actual post-Canvas parse is authoritative even for new/derived
          // modules that were not in the startup lexical scan. No reparse.
          if (changed) this.#universe = new TailwindCandidateUniverse(this.#names)
        }
        return result
      },
    )
  }

  invalidate() {
    this.session.invalidate()
  }
}
