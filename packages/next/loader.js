// The webpack/Turbopack loader.
//
// Plain `.js` rather than the `.ts` the rest of this repository is written
// in, because a loader is resolved and executed by the bundler rather than
// imported by a tool that understands TypeScript. `@hozo/storybook`'s
// `preset.js` exists for the same reason.
//
// Asynchronous because project CSS preparation is. Snapshot, compiler and
// session are owned together; a changed stylesheet retires all three.

import { statSync } from 'node:fs'
import path from 'node:path'

import { lowerModule, lowerModuleOrPrepare, sideEffectImport } from '@hozo/compiler/lower'
import {
  importSpecifier,
  resolveStylexRequests,
  scannableFile,
  TailwindCandidateUniverse,
  webBaseCssFor,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { preflightCss } from '@hozo/tailwind'
import { nextTailwindProject } from './dist/tailwind-epoch.js'

export default function hozoLoader(source) {
  const callback = this.async()
  const options = this.getOptions() ?? {}
  const file = scannableFile(this.resourcePath)
  if (!file) {
    callback(null, source)
    return
  }
  nextTailwindProject(options).then(
    async (state) => {
      const requestId = JSON.stringify([this.resourcePath, this.resourceQuery ?? ''])
      const request = state.start(requestId)
      try {
        registerStylesheetDependencies(this, state.watchFiles, state.missingFiles)
        request.check()
        // Every module that reaches this loader is rescanned, which is how
        // a class only a runtime expression produces stays covered while
        // `next dev` is running. The cache decides whether anything
        // actually changed.
        const modifiedMs = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0
        const cacheId = `${path.resolve(file)}${this.resourceQuery ?? ''}`
        const cacheChanged = state.cache.scanFile(cacheId, source, modifiedMs)
        if (cacheChanged) {
          state.candidateDirty = true
          // A project's first Tailwind class can arrive in a file compiled
          // long after `withHozo` ran, and the base layer is decided by
          // whether there are any.
          state.cache.persist()
          state.observe(state.cache.candidates())
        }

        const absoluteFile = path.resolve(file)
        const stylexGraphChanged = state.stylexModules.scanFile(absoluteFile, source, modifiedMs)
        if (stylexGraphChanged) {
          state.stylexModules.persist()
        }

        let registryChanged = stylexGraphChanged
        if (!state.stylexGraphResolved || stylexGraphChanged) {
          registryChanged =
            (await resolveStylexRequests(
              state.stylexModules,
              state.stylexModules.resolutionRequests(),
              (specifier, importer) => resolveFromLoader(this, specifier, importer),
            )) || registryChanged
          state.stylexGraphResolved = true
        }
        request.check()
        const reexportSpecifiers = state.stylexModules.reexportSpecifiers(absoluteFile)
        const importRequests = source.includes('@stylexjs/stylex')
          ? state.stylexModules
              .importSpecifiers(absoluteFile)
              .filter(
                (specifier) =>
                  specifier !== '@stylexjs/stylex' && !state.compiler.sources.includes(specifier),
              )
              .map((specifier) => ({ importer: absoluteFile, specifier }))
          : []
        const resolvedCurrent = await resolveStylexRequests(
          state.stylexModules,
          [
            ...importRequests,
            ...reexportSpecifiers.map((specifier) => ({ importer: absoluteFile, specifier })),
          ],
          (specifier, importer) => resolveFromLoader(this, specifier, importer),
        )
        request.check()
        if (registryChanged || (resolvedCurrent && reexportSpecifiers.length > 0)) {
          state.compiler.setStylexModules(state.stylexModules.moduleSources())
        }

        const policy = { unloweredReactNativeJsx: options.unloweredReactNativeJsx }
        let lowered
        for (;;) {
          const universe = state.universe
          let emittedKey = universe.key
          lowered = state.session
            ? await state.session.runModule(requestId, universe, (compiler, context) => {
                const result = lowerModuleOrPrepare(
                  source,
                  this.resourcePath,
                  file,
                  compiler,
                  options.root,
                  context,
                  state.stylexModules,
                  policy,
                )
                if (result.kind === 'prepared') {
                  emittedKey = new TailwindCandidateUniverse([
                    ...universe.candidates,
                    ...result.module.candidates,
                  ]).key
                  state.observe(result.module.candidates)
                }
                return result
              })
            : lowerModule(
                source,
                this.resourcePath,
                file,
                state.compiler,
                options.root,
                state.stylexModules,
                policy,
              )
          request.check()
          if (state.session && emittedKey !== state.universe.key) continue
          // No provisional sheet/fire-and-forget reorder: publish only after
          // preparation for the final observed universe has completed.
          await state.refreshOrder(options)
          request.check()
          state.checkDependencies()
          if (!state.session || emittedKey === state.universe.key) break
        }
        if (state.candidateDirty) {
          writeFileIfChanged(
            options.candidateCssPath,
            state.cache.renderCss(state.theme, state.classOrder),
          )
          writePreflight(options, state.cache)
          state.candidateDirty = false
        }
        if (!lowered) {
          callback(null, source)
          return
        }
        for (const diagnostic of lowered.diagnostics) {
          this.emitWarning(hozoWarning(diagnostic))
        }
        const serverOnly = serverComponentNeedingScript(this.resourcePath, source, lowered)
        if (serverOnly) this.emitWarning(hozoWarning(serverOnly))
        writeFileIfChanged(lowered.cssPath, lowered.css)
        // Both stylesheets are imported from the module itself rather than
        // from one designated entry: the candidate sheet has to be present
        // whichever module the dynamic className lives in, and a bundler
        // resolves the repeated import to a single module in its graph.
        const code =
          // The base layer first. Preflight is element selectors only, so
          // every utility outranks it on specificity either way, but order
          // is what decides the ties and there is no reason to leave them
          // to the graph.
          sideEffectImport(importSpecifier(file, options.preflightPath)) +
          sideEffectImport(`./${lowered.cssFileName}`) +
          sideEffectImport(importSpecifier(file, options.candidateCssPath)) +
          lowered.code
        callback(null, code)
      } catch (error) {
        callback(error)
      } finally {
        request.finish()
      }
    },
    (error) => callback(error),
  )
}

function registerStylesheetDependencies(loader, files, missing) {
  for (const file of files) {
    if (!missing.has(file)) loader.addDependency?.(file)
    else if (typeof loader.addMissingDependency === 'function') loader.addMissingDependency(file)
    else loader.addDependency?.(file)
  }
}

function resolveFromLoader(loader, specifier, importer) {
  if (typeof loader.getResolve === 'function') {
    const resolve = loader.getResolve({})
    return Promise.resolve(resolve(path.dirname(importer), specifier)).then(
      (result) => (typeof result === 'string' ? result : undefined),
      () => undefined,
    )
  }
  if (typeof loader.resolve !== 'function') return Promise.resolve(undefined)
  return new Promise((complete) => {
    loader.resolve(path.dirname(importer), specifier, (error, result) => {
      complete(error || typeof result !== 'string' ? undefined : result)
    })
  })
}

/** Project font faces and Tailwind's optional base layer. */
function writePreflight(options, cache) {
  writeFileIfChanged(
    options.preflightPath,
    webBaseCssFor(options.fontFaceCss, options.preflight, preflightCss(), cache.usesTailwind),
  )
}

/**
 * A Hozo diagnostic as the two bundlers each want it.
 *
 * An `Error` because webpack says so -- hand it a string and it prints
 * `(Emitted value instead of an instance of Error)` in front of the
 * message. Turbopack accepts either and wraps a string in an Error itself.
 *
 * With the stack replaced by the message, because both then print it: the
 * frames point into this loader, which is where the warning was *raised*
 * and never where it is *about*. Both bundlers already attribute the
 * warning to the right source module on their own.
 */
/** The two positions where "server component" is decidable from the path. */
const APP_ROUTER_ENTRY = /\/app\/(?:.*\/)?(?:page|layout)\.(?:tsx|mdx)$/

const USE_CLIENT = /['"]use client['"]/

/**
 * An App Router entry that cannot run what Hozo compiled for it.
 *
 * Whether a module is a server component is not readable from the module
 * -- `'use client'` marks a boundary, and a client component reached from
 * another carries no directive. There are two positions where it *is*
 * readable, and this is the only place in Hozo that knows them: a
 * `page` or `layout` under `app/` with no directive is always a server
 * component, whatever imports it.
 *
 * So the convention lives here, in the integration that already registers
 * Next's loader rules, and `needsClientBoundary` stays a plain fact about
 * the output in the compiler.
 *
 * A warning and not an error, because that fact is deliberately biased
 * toward saying yes -- it answers on a word match, so a page whose prose
 * contains "List" reaches this. Next will refuse the build a moment later
 * anyway, with `Event handlers cannot be passed to Client Component
 * props` naming `onClick`, a prop nobody wrote. The value here is a line
 * above that one which names the file and the fix.
 */
export function serverComponentNeedingScript(resourcePath, source, lowered) {
  if (!lowered.needsClientBoundary) return undefined
  const normalized = resourcePath.split(path.sep).join('/')
  if (!APP_ROUTER_ENTRY.test(normalized)) return undefined
  // The directive has to be the first statement to count, so it is near
  // the top or it is not a directive. Searching a prefix rather than
  // parsing for one: a comment mentioning it inside that prefix costs a
  // warning nobody sees, which is the harmless direction.
  if (USE_CLIENT.test(source.slice(0, 400))) return undefined
  return {
    code: 'SERVER_COMPONENT_NEEDS_CLIENT',
    message:
      'this is a server component -- a page or layout under app/ with no `use client` -- ' +
      'and Hozo compiled something into it that needs script: an event handler, a runtime ' +
      'helper, or a primitive it could not lower. Add `use client` at the top, or move the ' +
      'interactive part into its own component.',
  }
}

function hozoWarning(diagnostic) {
  const warning = new Error(`[hozo] ${diagnostic.code}: ${diagnostic.message}`)
  warning.name = 'HozoDiagnostic'
  warning.stack = warning.message
  return warning
}
