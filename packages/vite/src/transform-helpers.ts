// Stateless transform helpers shared by Vite's buildStart and transform passes:
// StyleX module graph sync, transformed-source (MDX) unfolding / OXC finishing,
// and failed-inventory retirement.

import type { Compiler } from '@hozo/compiler'
import {
  foldedPrimitiveCalls,
  type LowerModuleOptions,
  lowerModule,
  lowerModuleOrPrepare,
  prepareOwnerLowerModule,
} from '@hozo/compiler/lower'
import {
  resolveStylexRequests,
  type StylexModuleCache,
  TailwindCandidateUniverse,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { type ResolvedConfig, transformWithOxc } from 'vite'
import type { ViteModuleResolve, ViteOwnerSession } from './owner-session.ts'
import type { ViteStylesheetSession } from './stylesheet-session.ts'
import type { ViteTailwindEpoch } from './tailwind-epoch.ts'

export interface CompiledSourceResult {
  code: string
  map: { version: number; sources: string[]; names: string[]; mappings: string } | null
}

export async function syncStylexModuleGraph(
  stylexModules: StylexModuleCache,
  compiler: Compiler,
  absoluteFile: string,
  code: string,
  stylexGraphChanged: boolean,
  resolve: ViteModuleResolve,
) {
  const resolveId = async (specifier: string, importer: string) =>
    (await resolve(specifier, importer))?.id
  const reexportSpecifiers = stylexModules.reexportSpecifiers(absoluteFile)
  if (stylexGraphChanged) {
    await resolveStylexRequests(stylexModules, stylexModules.resolutionRequests(), resolveId)
  }
  const importRequests = code.includes('@stylexjs/stylex')
    ? stylexModules
        .importSpecifiers(absoluteFile)
        .filter(
          (specifier) => specifier !== '@stylexjs/stylex' && !compiler.sources.includes(specifier),
        )
        .map((specifier) => ({ importer: absoluteFile, specifier }))
    : []
  const resolvedCurrent = await resolveStylexRequests(
    stylexModules,
    [
      ...importRequests,
      ...reexportSpecifiers.map((specifier) => ({ importer: absoluteFile, specifier })),
    ],
    resolveId,
  )
  if (stylexGraphChanged || (resolvedCurrent && reexportSpecifiers.length > 0)) {
    compiler.setStylexModules(stylexModules.moduleSources())
  }
}

/**
 * A `.mdx` arrives here as whatever the MDX plugin produced. Told `jsx: true`
 * it produces JSX and everything below works; told nothing it folds the
 * document to `_jsx()` calls, and Hozo reads JSX. `@astrojs/mdx` exposes no
 * `jsx` option at all (#137), so on Astro this was never a setting anybody
 * forgot.
 *
 * So the calls are put back as JSX before Hozo reads them, and
 * `finalizeTransformedSource` -- which hands the file to oxc as `.tsx` -- folds
 * them again. That pairing is why the un-fold lives here rather than in
 * `lowerModule`: it is only sound for a file this pass is going to fold back,
 * and every other integration is handed real JSX.
 *
 * What it cannot put back stays folded, and that is what is reported.
 * `unfoldJsxCalls` declines anything with no JSX spelling -- a computed prop
 * key, a spread child -- rather than approximating it, so the warning names
 * exactly the calls that are still passing through uncompiled.
 */
export function unfoldTransformedSource(
  code: string,
  file: string,
  compiler: Compiler,
  warn: (message: string) => void,
): { source: string; jsxImportSource: string | undefined } {
  const unfolded = compiler.unfoldJsxCalls(code)
  const source = unfolded?.code ?? code
  // Folded back with the runtime it was folded with. Astro's MDX output calls
  // `_jsx` from `astro/jsx-runtime`; re-folded under this project's default the
  // same tree is built by React's runtime, and Astro renders that as the string
  // `[object Object]` -- no error, on a page whose stylesheet came out correct.
  // Measured on `apps/landing`.
  const jsxImportSource = unfolded?.importSource
  const folded = foldedPrimitiveCalls(source, compiler.sources)
  if (folded.length > 0) {
    warn(
      `${file}: ${folded.join(', ')} reached Hozo as _jsx() calls that cannot be written ` +
        'as JSX -- a computed prop name or a spread child -- so nothing there was lowered ' +
        'and those class names are passing through uncompiled. Pass `jsx: true` to the ' +
        'MDX plugin so Hozo sees the JSX; on Astro, where `@astrojs/mdx` has no such ' +
        'option, move this markup into a .tsx component and import it -- that compiles ' +
        'fully and needs no client directive.',
    )
  }
  return { source, jsxImportSource }
}

/**
 * A transformed source is JSX in a file whose extension says otherwise, and
 * Vite decides whether to parse JSX from exactly that extension -- `OxcOptions`
 * omits `lang`, so no project setting can say "treat `.mdx` as JSX". Left
 * alone, the run fails at `vite:oxc` with "JSX syntax is disabled", which names
 * neither MDX nor Hozo.
 *
 * `.tsx` and not `.jsx`, which is not cosmetic. `referencesHozoPrimitive`
 * deliberately leaves the `@hozo/core` import in place and relies on the
 * bundler eliding it once nothing refers to it -- and that elision is a
 * *TypeScript* rule. Named `.jsx` the import survived to import analysis, which
 * then failed to resolve `@hozo/core` from a temporary project that has no
 * node_modules. MDX output is plain JS with JSX, which is a subset of TSX, so
 * reading it as TSX costs nothing.
 */
export async function finalizeTransformedSource(
  code: string,
  file: string,
  jsxImportSource: string | undefined,
  resolvedConfig: ResolvedConfig,
): Promise<CompiledSourceResult> {
  const compiled = await transformWithOxc(
    code,
    `${file}.tsx`,
    jsxImportSource ? { jsx: { runtime: 'automatic', importSource: jsxImportSource } } : undefined,
    undefined,
    resolvedConfig,
  )
  return { code: compiled.code, map: compiled.map ?? null }
}

export interface LowerWithNamespaceRetryParams {
  source: string
  id: string
  file: string
  absoluteFile: string
  requestId: string
  root: string
  current: ViteTailwindEpoch
  stylesheets: ViteStylesheetSession
  ownerSession: ViteOwnerSession
  stylexModules: StylexModuleCache
  policy: LowerModuleOptions
  reinstallHelpers: () => void
  checkRequest: () => void
}

/**
 * Lowers one module under the current candidate universe, retrying only when
 * the actual parse discovers candidates missing from the lexical seed. Never
 * delivers a result compiled against a stale universe after an await.
 */
export async function lowerWithNamespaceRetry({
  source,
  id,
  file,
  absoluteFile,
  requestId,
  root,
  current,
  stylesheets,
  ownerSession,
  stylexModules,
  policy,
  reinstallHelpers,
  checkRequest,
}: LowerWithNamespaceRetryParams): Promise<{
  lowered: ReturnType<typeof lowerModule>
  ownerDelivery?: ReturnType<ViteOwnerSession['deliveryMeta']>
}> {
  const recordActual = (names: readonly string[]) => {
    if (
      stylesheets.rememberCandidates(JSON.stringify(['actual', requestId]), file, names) &&
      stylesheets.updateUniverse()
    )
      stylesheets.invalidateTransforms()
  }

  let lowered: ReturnType<typeof lowerModule>
  let ownerDelivery: ReturnType<ViteOwnerSession['deliveryMeta']>
  // Emit once during transform, before Vite consumes the companion stylesheet.
  // Rank-free module output does not need a final graph.
  for (;;) {
    const requestedUniverse = stylesheets.universe
    let emittedKey = requestedUniverse.key
    const callerSelection = ownerSession.resolveCallerSelection(absoluteFile, id)
    if (callerSelection) {
      if (!current.session)
        throw new Error('[hozo] owner callers require a captured stylesheet and package epoch')
      const [output] = await current.session.emit(
        requestId,
        [
          (sessionCompiler) => {
            const module = prepareOwnerLowerModule(
              source,
              id,
              absoluteFile,
              sessionCompiler,
              root,
              callerSelection.owners.lease,
              callerSelection.requests,
              stylexModules,
              policy,
            )
            try {
              emittedKey = new TailwindCandidateUniverse([
                ...requestedUniverse.candidates,
                ...module.candidates,
              ]).key
              recordActual(module.candidates)
              return module
            } catch (error) {
              module.dispose()
              throw error
            }
          },
        ],
        requestedUniverse.candidates,
      )
      lowered = output!.lowered
      ownerDelivery = ownerSession.deliveryMeta(callerSelection.owners, output!.owners)
    } else {
      lowered = current.session
        ? await current.session.runModule(
            requestId,
            requestedUniverse,
            (sessionCompiler, context) => {
              const result = lowerModuleOrPrepare(
                source,
                id,
                file,
                sessionCompiler,
                root,
                context,
                stylexModules,
                policy,
              )
              if (result.kind === 'prepared') {
                emittedKey = new TailwindCandidateUniverse([
                  ...requestedUniverse.candidates,
                  ...result.module.candidates,
                ]).key
                recordActual(result.module.candidates)
              }
              return result
            },
          )
        : lowerModule(source, id, file, current.compiler, root, stylexModules, policy)
    }
    current.check()
    checkRequest()
    // Only exceptional namespace expansion retries; ordinary warm transforms
    // keep the direct actual-parse path.
    if (!current.session || emittedKey === stylesheets.universe.key) break
    reinstallHelpers()
    current.compiler.setStylexModules(stylexModules.moduleSources())
  }
  return { lowered, ownerDelivery }
}

export function writeFailedInventory(inventoryPath: string) {
  writeFileIfChanged(
    inventoryPath,
    JSON.stringify({ schema: 1, status: 'failed', finalOrderingReady: false }),
  )
}
