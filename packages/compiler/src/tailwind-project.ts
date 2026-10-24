// Compiler owns retained IR/context handles. The caller owns asynchronous
// stylesheet preparation, so compiler/project does not depend on Tailwind JS.
import { type PreparedModule, prepareTailwindContext } from './index.ts'

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
  const owned = [...modules]
  try {
    if (new Set(owned).size !== owned.length)
      throw new Error('Prepared module occurs twice in a batch')
    const candidates = Object.freeze(
      [
        ...new Set([...additionalCandidates, ...owned.flatMap((module) => module.candidates)]),
      ].sort(),
    )
    const context = prepareTailwindContext(await prepare(candidates))
    context.requireCandidates([...candidates])
    return owned.map((module) => module.emit(context))
  } finally {
    for (const module of owned) module.dispose()
  }
}
