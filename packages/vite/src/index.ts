// Web bundler integration (proposal §A: Vite before Metro). Splices
// hozo_web's compiled JSX directly into the original source at the exact
// span the Rust side reported, rather than replacing the whole file --
// that's what lets a component keep its own hooks/handlers/other logic
// untouched while only its View/Text/Pressable/Button usage gets lowered.
//
// CSS is written to a real `<file>.hozo.css` companion file next to the
// source and imported normally, rather than served through a Vite virtual
// module -- simpler and more robust for this pass than fighting Vite's
// virtual-module CSS-type detection; a real cache directory or virtual
// module is a reasonable thing to move to once this needs to survive
// production builds cleanly.
//
// One consequence, measured against a running dev server rather than
// reasoned about: the companion stylesheet is written *during* the source
// module's transform, so a style-only edit reaches the browser in two
// rounds. The `.tsx` change triggers the first, that transform writes the
// CSS, and the watcher seeing the new CSS triggers the second. It
// converges because `writeFileIfChanged` refuses to rewrite identical
// bytes -- without that, each transform would invalidate the stylesheet it
// had just written and the two would take turns forever.
//
// Alongside that, one project-wide stylesheet covers the classes the
// compiler *couldn't* read (proposal §7's third tier). Those come from a
// byte scan of every source file rather than from the AST, so this plugin
// owns the project walk and the file-deletion signal, while the cache in
// Rust owns scanning, staleness, and persistence.

import { mkdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { type CandidateCache, scanTailwindOrderCandidates } from '@hozo/compiler'
import { reportDiagnostics } from '@hozo/compiler/diagnostics'
import {
  foldedPrimitiveCalls,
  lowerModule,
  lowerModuleOrPrepare,
  prepareLowerModuleStyles,
  sideEffectImport,
} from '@hozo/compiler/lower'
import {
  CACHE_DIR,
  discoverSources,
  findClassHelpers,
  type HozoProjectOptions,
  importSpecifier,
  isTransformedSource,
  preflightCssPath,
  resolveClassHelpers,
  resolveStylexRequests,
  type StylexModuleCache,
  scannableFile,
  scanProject,
  scanSummary,
  TailwindCandidateUniverse,
  TailwindPreparationCancelled,
  webBaseCssFor,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { preflightCss } from '@hozo/tailwind'
import { type Plugin, type ResolvedConfig, transformWithOxc, type ViteDevServer } from 'vite'
import { contentRevision, ViteCandidateInventory } from './candidate-inventory.ts'
import { finalStylesState, ViteFinalStyleGraph } from './final-style-graph.ts'
import { discoveryPaths, openViteTailwindEpoch, type ViteTailwindEpoch } from './tailwind-epoch.ts'

/**
 * The same options every Hozo integration takes, under this one's name.
 *
 * Nothing is added here beyond that shared set. The design tokens a project defines
 * reach the compiler through `css`, and without them Hozo resolves against
 * Tailwind's defaults -- right until a project defines its own, and then
 * `bg-brand` compiles to a CSS variable nothing defines and `p-4` to the
 * wrong number of pixels. The theme is read once at `buildStart` rather
 * than per file: it is a project-wide fact, and re-reading it for every
 * module would run Tailwind's resolver hundreds of times for one answer.
 */
export type HozoOptions = HozoProjectOptions

export function hozo(options: HozoOptions = {}): Plugin[] {
  // One matching compiler/session per stylesheet epoch, never per file.
  let root = process.cwd()
  let cache: CandidateCache
  let stylexModules: StylexModuleCache
  let candidateCssPath = ''
  let preflightPath = ''
  let includedFiles = new Set<string>()
  let server: ViteDevServer | undefined
  let resolvedConfig: ResolvedConfig | undefined
  let preflight = ''
  // The candidate order Tailwind would use, refreshed whenever the set
  // changes. Held rather than recomputed per write because the write path
  // is synchronous and this is not: `getClassOrder` needs the project's
  // design system.
  let classOrder: string[] = []
  let epoch: ViteTailwindEpoch | undefined
  let pendingEpoch: Promise<ViteTailwindEpoch> | undefined
  let epochGeneration = 0
  let candidateGeneration = 0
  let universe = new TailwindCandidateUniverse([])
  let sheetUniverseKey = ''
  const orderingSources = new Map<string, { file: string; names: readonly string[] }>()
  const transformedIds = new Set<string>()
  const requests = new Map<string, { token: symbol; file: string }>()
  let inventory: ViteCandidateInventory | undefined
  let inventoryPath = ''
  let finalStylesGraph: ViteFinalStyleGraph | undefined
  let finalStylesPath = ''

  function updateUniverse() {
    const next = new TailwindCandidateUniverse([
      ...cache.candidates(),
      ...[...orderingSources.values()].flatMap((entry) => entry.names),
    ])
    if (next.key === universe.key) return false
    universe = next
    return true
  }

  function rememberCandidates(key: string, file: string, names: readonly string[]) {
    const normalized = [...new Set(names)].sort()
    if (JSON.stringify(orderingSources.get(key)?.names) === JSON.stringify(normalized)) return false
    orderingSources.set(key, { file: path.resolve(file), names: normalized })
    return true
  }

  async function currentEpoch(warn: (message: string) => void): Promise<ViteTailwindEpoch> {
    if (epoch) return epoch
    if (!pendingEpoch) {
      const generation = epochGeneration
      pendingEpoch = openViteTailwindEpoch(root, options, warn).then((next) => {
        if (generation !== epochGeneration) {
          next.invalidate()
          throw new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED')
        }
        if (!next.isCurrent()) {
          next.invalidate()
          pendingEpoch = undefined
          return currentEpoch(warn)
        }
        if (stylexModules) next.compiler.setStylexModules(stylexModules.moduleSources())
        epoch = next
        return next
      })
      const pending = pendingEpoch
      void pending.catch(() => {
        if (pendingEpoch === pending) pendingEpoch = undefined
      })
    }
    return pendingEpoch
  }

  async function refreshCandidates(warn: (message: string) => void) {
    for (;;) {
      const generation = ++candidateGeneration
      const nextUniverse = universe
      const current = await currentEpoch(warn)
      const next = await current.classOrder(nextUniverse.candidates)
      current.check()
      if (generation !== candidateGeneration) return
      if (nextUniverse.key !== universe.key) continue
      classOrder = next
      sheetUniverseKey = nextUniverse.key
      writeCandidateCss()
      return
    }
  }

  function invalidateTransforms() {
    if (!server) return
    for (const environment of Object.values(server.environments)) {
      for (const id of transformedIds) {
        const module = environment.moduleGraph.getModuleById(id)
        if (module) environment.moduleGraph.invalidateModule(module)
      }
    }
    server.ws.send({ type: 'full-reload' })
  }

  /// Regenerates the project-wide candidate stylesheet and, in dev, makes
  /// the already-loaded module pick it up. The file lives under
  /// `node_modules`, which Vite's watcher ignores by default, so the
  /// invalidation has to be explicit rather than left to the watcher.
  function writeCandidateCss() {
    // Before the invalidation below, not after: the two stylesheets are
    // one update, and a reload that saw only half of it would be a page
    // styled against the previous answer.
    writePreflightCss()
    if (!writeFileIfChanged(candidateCssPath, cache.renderCss(epoch?.theme, classOrder)))
      return false
    const module = server?.moduleGraph.getModuleById(candidateCssPath)
    if (module) {
      void server?.reloadModule(module)
    }
    return true
  }

  /// The base layer Tailwind's utilities are authored against, which Hozo
  /// does not otherwise ship. Written on the same terms as the candidate
  /// stylesheet -- always present, contents decided by the option and by
  /// whether the project uses Tailwind at all -- and invalidated the same
  /// way, since it lives under `node_modules` where the watcher does not
  /// look.
  function writePreflightCss() {
    const css = webBaseCssFor(options.fontFaceCss, options.preflight, preflight, cache.usesTailwind)
    if (!writeFileIfChanged(preflightPath, css)) return
    const module = server?.moduleGraph.getModuleById(preflightPath)
    if (module) {
      void server?.reloadModule(module)
    }
  }

  /**
   * The work itself, shared by both passes below.
   *
   * One body rather than two copies: the passes differ only in when they
   * run and which files reach them, and a second copy of ninety lines
   * would be two things to keep in step. `accepts` is what differs --
   * each pass claims its own files, so no module is transformed twice and
   * neither pass has to recognise the other's leftovers.
   */
  const pass = (accepts: (file: string) => boolean): Pick<Plugin, 'transform'> => ({
    async transform(code, id) {
      const file = scannableFile(id, (candidate) => includedFiles.has(candidate))
      if (file && !accepts(file)) return
      if (!file) return
      const request = Symbol(id)
      const requestId = JSON.stringify([this.environment?.name ?? 'default', id])
      requests.set(requestId, { token: request, file: path.resolve(file) })
      const checkRequest = () => {
        if (requests.get(requestId)?.token !== request)
          throw new TailwindPreparationCancelled('TAILWIND_MODULE_SUPERSEDED')
      }
      try {
        const isDerivedModule = id.includes('?')
        let candidateMeta: Record<string, unknown> | undefined = isDerivedModule
          ? inventory?.transformDerivedMeta(id, code)
          : undefined
        let stylexGraphChanged = false
        // A transformed source is not in the project walk -- see
        // `TRANSFORMABLE` -- so it has to be admitted here or its classes
        // would never reach the candidate set at all.
        const scannable =
          file &&
          !isDerivedModule &&
          (includedFiles.has(path.resolve(file)) || isTransformedSource(file))
        if (file && scannable) {
          // For the `pre` pass `code` is still the source as written, which
          // is what the scanner expects. For the second pass it is the JSX
          // another plugin produced, which is the first form of that file
          // the scanner *can* read. Keyed by the same absolute path
          // `scanProject`'s walk used, so a file scanned there isn't
          // recorded twice under two spellings.
          const modifiedMs = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0
          const cacheChanged = cache.scanFile(path.resolve(file), code, modifiedMs)
          // Capture the facts belonging to this exact input before any await
          // can let another module revise the shared physical-file entry.
          if (inventory) {
            const record = cache.exportFile(path.resolve(file))
            if (record) candidateMeta = inventory.transformMeta(id, code, record)
          }
          const sourceChanged = rememberCandidates(
            JSON.stringify(['lexical', file]),
            file,
            scanTailwindOrderCandidates(code),
          )
          const orderChanged = (cacheChanged || sourceChanged) && updateUniverse()
          if (orderChanged) invalidateTransforms()
          if (cacheChanged || orderChanged) {
            // Do not publish a provisional sheet or let a late old order
            // overwrite the current candidate revision.
            await refreshCandidates((message) => this.warn(message))
            checkRequest()
          }
          stylexGraphChanged = stylexModules.scanFile(path.resolve(file), code, modifiedMs)
        }

        const current = await currentEpoch((message) => this.warn(message))
        checkRequest()
        const compiler = current.compiler
        const absoluteFile = path.resolve(file)
        const reexportSpecifiers = stylexModules.reexportSpecifiers(absoluteFile)
        if (stylexGraphChanged) {
          await resolveStylexRequests(
            stylexModules,
            stylexModules.resolutionRequests(),
            async (specifier, importer) => {
              const resolved = await this.resolve(specifier, importer, { skipSelf: true })
              return resolved?.id
            },
          )
        }
        const importRequests = code.includes('@stylexjs/stylex')
          ? stylexModules
              .importSpecifiers(absoluteFile)
              .filter(
                (specifier) =>
                  specifier !== '@stylexjs/stylex' && !compiler.sources.includes(specifier),
              )
              .map((specifier) => ({ importer: absoluteFile, specifier }))
          : []
        const resolvedCurrent = await resolveStylexRequests(
          stylexModules,
          [
            ...importRequests,
            ...reexportSpecifiers.map((specifier) => ({ importer: absoluteFile, specifier })),
          ],
          async (specifier, importer) => {
            const resolved = await this.resolve(specifier, importer, { skipSelf: true })
            return resolved?.id
          },
        )
        if (stylexGraphChanged || (resolvedCurrent && reexportSpecifiers.length > 0)) {
          compiler.setStylexModules(stylexModules.moduleSources())
        }
        // A `.mdx` arrives here as whatever the MDX plugin produced. Told
        // `jsx: true` it produces JSX and everything below works; told
        // nothing it folds the document to `_jsx()` calls, and Hozo reads
        // JSX. `@astrojs/mdx` exposes no `jsx` option at all (#137), so on
        // Astro this was never a setting anybody forgot.
        //
        // So the calls are put back as JSX before Hozo reads them, and the
        // step at the end of this same transform -- `transformWithOxc`,
        // which hands the file to oxc as `.tsx` -- folds them again. That
        // pairing is why the un-fold lives here rather than in
        // `lowerModule`: it is only sound for a file this pass is going to
        // fold back, and every other integration is handed real JSX.
        //
        // What it cannot put back stays folded, and that is what is
        // reported. `unfoldJsxCalls` declines anything with no JSX spelling
        // -- a computed prop key, a spread child -- rather than
        // approximating it, so the warning now names exactly the calls that
        // are still passing through uncompiled instead of all of them.
        let source = code
        let jsxImportSource: string | undefined
        if (isTransformedSource(file)) {
          const unfolded = compiler.unfoldJsxCalls(code)
          source = unfolded?.code ?? code
          // Folded back with the runtime it was folded with. Astro's MDX
          // output calls `_jsx` from `astro/jsx-runtime`; re-folded under
          // this project's default the same tree is built by React's
          // runtime, and Astro renders that as the string `[object
          // Object]` -- no error, on a page whose stylesheet came out
          // correct. Measured on `apps/landing`.
          jsxImportSource = unfolded?.importSource
          const folded = foldedPrimitiveCalls(source, compiler.sources)
          if (folded.length > 0) {
            this.warn(
              `${file}: ${folded.join(', ')} reached Hozo as _jsx() calls that cannot be written ` +
                'as JSX -- a computed prop name or a spread child -- so nothing there was lowered ' +
                'and those class names are passing through uncompiled. Pass `jsx: true` to the ' +
                'MDX plugin so Hozo sees the JSX; on Astro, where `@astrojs/mdx` has no such ' +
                'option, move this markup into a .tsx component and import it -- that compiles ' +
                'fully and needs no client directive.',
            )
          }
        }

        // The project's own class-joining functions this file calls (#964),
        // found through Vite's own resolution and watched, so editing the
        // helper re-transforms its callers. Set immediately before lowering,
        // with no await in between: the compiler is shared by every file.
        const helpers = await findClassHelpers(
          source,
          absoluteFile,
          async (specifier, importer) =>
            (await this.resolve(specifier, importer, { skipSelf: true }))?.id,
          (dependency) => this.addWatchFile(dependency),
        )
        compiler.setClassHelpers(resolveClassHelpers(options.classHelpers, helpers))
        checkRequest()
        current.check()
        // Helpers are installed immediately before the actual parse. StyleX
        // registry changes are installed only when its graph/epoch changes,
        // not rebuilt for every warm file. The continuation captures both.
        const policy = { unloweredReactNativeJsx: options.unloweredReactNativeJsx }
        let lowered: ReturnType<typeof lowerModule>
        if (finalStylesGraph && current.snapshot) {
          const continuation = prepareLowerModuleStyles(
            source,
            id,
            file,
            compiler,
            root,
            stylexModules,
            policy,
          )
          finalStylesGraph.observe(id, code, continuation)
          if (
            rememberCandidates(
              JSON.stringify(['actual', requestId]),
              file,
              continuation.module.candidates,
            )
          )
            updateUniverse()
          lowered = continuation.initial
        } else
          for (;;) {
            const requestedUniverse = universe
            let emittedKey = requestedUniverse.key
            lowered = current.session
              ? await current.session.runModule(
                  requestId,
                  requestedUniverse,
                  (compiler, context) => {
                    const result = lowerModuleOrPrepare(
                      source,
                      id,
                      file,
                      compiler,
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
                      if (
                        rememberCandidates(
                          JSON.stringify(['actual', requestId]),
                          file,
                          result.module.candidates,
                        ) &&
                        updateUniverse()
                      )
                        invalidateTransforms()
                    }
                    return result
                  },
                )
              : lowerModule(source, id, file, compiler, root, stylexModules, policy)
            current.check()
            checkRequest()
            // Only exceptional namespace expansion retries; ordinary warm
            // transforms keep the direct actual-parse path. Never deliver a
            // result from a different candidate namespace after an await.
            if (!current.session || emittedKey === universe.key) break
            compiler.setClassHelpers(resolveClassHelpers(options.classHelpers, helpers))
            compiler.setStylexModules(stylexModules.moduleSources())
          }
        if (sheetUniverseKey !== universe.key)
          await refreshCandidates((message) => this.warn(message))
        current.check()
        checkRequest()
        if (!lowered) return candidateMeta ? { meta: candidateMeta } : undefined

        // Shared with Metro and Next, which is new: this warned on
        // everything including error-severity diagnostics, and Metro threw.
        // The difference looked deliberate and wasn't -- every error Hozo
        // can emit today comes from the Native backend, so this had simply
        // never been handed one.
        reportDiagnostics(lowered.diagnostics, file, (message) => this.warn(message))

        let next = lowered.code
        writeFileIfChanged(lowered.cssPath, lowered.css)
        // Imported from every lowered file rather than from one designated
        // entry: the candidate sheet has to be present whichever module the
        // dynamic className lives in, and Vite resolves the repeated import
        // to a single module in the graph.
        // Generate the declarations through JSON.stringify: Storybook's
        // extensionless-import checker inspects preset dependency source and
        // otherwise mistakes our code-generating string for a real import.
        next =
          // First of the three: element selectors lose to every utility on
          // specificity, so a base layer that landed after them would be a
          // base layer with no effect on the cases it exists for.
          sideEffectImport(importSpecifier(file, preflightPath)) +
          sideEffectImport(`./${lowered.cssFileName}`) +
          sideEffectImport(importSpecifier(file, candidateCssPath)) +
          next

        // A transformed source is JSX in a file whose extension says
        // otherwise, and Vite decides whether to parse JSX from exactly that
        // extension -- `OxcOptions` omits `lang`, so no project setting can
        // say "treat `.mdx` as JSX". Left alone, the run fails at
        // `vite:oxc` with "JSX syntax is disabled", which names neither MDX
        // nor Hozo.
        //
        // So Hozo finishes what it started, under the project's own oxc
        // settings rather than a second opinion about them. Only for these
        // files: everything else arrives with an extension Vite already
        // understands.
        //
        // `.tsx` and not `.jsx`, which is not cosmetic. `referencesHozoPrimitive`
        // deliberately leaves the `@hozo/core` import in place and relies on the
        // bundler eliding it once nothing refers to it -- and that elision is a
        // *TypeScript* rule. Named `.jsx` the import survived to import
        // analysis, which then failed to resolve `@hozo/core` from a temporary
        // project that has no node_modules. MDX output is plain JS with JSX,
        // which is a subset of TSX, so reading it as TSX costs nothing.
        if (isTransformedSource(file) && resolvedConfig) {
          const compiled = await transformWithOxc(
            next,
            `${file}.tsx`,
            jsxImportSource
              ? { jsx: { runtime: 'automatic', importSource: jsxImportSource } }
              : undefined,
            undefined,
            resolvedConfig,
          )
          current.check()
          checkRequest()
          transformedIds.add(id)
          return { code: compiled.code, map: compiled.map ?? null, meta: candidateMeta }
        }

        transformedIds.add(id)
        return { code: next, map: null, meta: candidateMeta }
      } finally {
        if (requests.get(requestId)?.token === request) requests.delete(requestId)
      }
    },
  })

  /**
   * The second pass, for sources another plugin has to produce first.
   *
   * `.mdx` on disk is Markdown, and the pass above would be handed
   * exactly that -- nothing Hozo can parse, and prose the scanner should
   * not read. This one wants the JSX the MDX plugin produced instead.
   *
   * Three transforms have to happen in one order, and it is worth writing
   * down because two of them are invisible:
   *
   *   1. the MDX plugin turns Markdown into JSX  (`jsx: true`)
   *   2. this pass reads that JSX and lowers it
   *   3. something compiles the JSX this leaves behind
   *
   * Step 3 is this pass too -- see `transformWithOxc` below -- which is
   * what lets step 2 be an ordinary plugin rather than a `pre` one. That
   * matters, because `pre` only worked when the MDX plugin was `pre` *and*
   * registered first, and a host can register it second: Astro's
   * integration adds its own `pre` MDX plugin after the user's
   * `vite.plugins`, so a `pre` pass here was handed raw Markdown, found
   * nothing to lower, and left JSX for `es-module-lexer` to choke on.
   *
   * An ordinary plugin runs after every `pre` whoever registered it, which
   * is the only ordering that holds for both. Nothing else may be told to
   * treat `.mdx` as JSX -- Vite's core transform runs before this one, and
   * a project that asks it to claim `.mdx` takes step 3 away.
   *
   * `jsx: true` is what makes any of it possible. `@mdx-js/rollup` and
   * `@next/mdx` both expose it; `@astrojs/mdx` does not, so on Astro a
   * `.tsx` island is still the way.
   *
   * A separate plugin rather than a second hook because a plugin has one
   * `transform`, and these two claim different files. It shares every
   * piece of state with the first, being closed over by the same call.
   */
  const transformed: Plugin = {
    name: 'hozo:transformed',
    ...pass(isTransformedSource),
  }

  return [
    {
      name: 'hozo',
      enforce: 'pre',

      configResolved(config) {
        root = options.root ?? config.root
        resolvedConfig = config
      },

      configureServer(devServer) {
        server = devServer
      },

      async buildStart() {
        finalStylesGraph?.dispose()
        finalStylesGraph = undefined
        epochGeneration++
        epoch?.invalidate()
        epoch = undefined
        pendingEpoch = undefined
        const environment = this.environment?.name ?? 'default'
        inventory =
          resolvedConfig?.command === 'build'
            ? new ViteCandidateInventory(environment, options.sources)
            : undefined
        if (inventory) {
          // Retire old evidence before snapshot acquisition or scanning can
          // fail, not only after those operations happen to succeed.
          const directory = path.join(root, CACHE_DIR)
          mkdirSync(directory, { recursive: true })
          inventoryPath = path.join(
            directory,
            `candidate-inventory-${encodeURIComponent(environment)}.json`,
          )
          finalStylesPath = path.join(
            directory,
            `final-styles-${encodeURIComponent(environment)}.json`,
          )
          writeFileIfChanged(
            inventoryPath,
            JSON.stringify({ schema: 1, status: 'collecting', finalOrderingReady: false }),
          )
          writeFileIfChanged(finalStylesPath, JSON.stringify(finalStylesState('collecting')))
        }
        const current = await currentEpoch((message) => this.warn(message))
        for (const dependency of current.watchFiles) this.addWatchFile(dependency)

        // The whole project, not just what the bundler happens to reach: a
        // class can be produced by a module the graph never resolves
        // statically.
        const project = scanProject(root, options.content, options.sources)
        cache = project.cache
        stylexModules = project.stylexModules
        if (inventory) {
          finalStylesGraph = current.snapshot ? new ViteFinalStyleGraph(environment) : undefined
          if (!finalStylesGraph)
            writeFileIfChanged(finalStylesPath, JSON.stringify(finalStylesState('unavailable')))
        }
        orderingSources.clear()
        for (const file of project.files) {
          const source = readFileSync(file, 'utf8')
          inventory?.observeAuthored(
            JSON.stringify(['authored', file]),
            source,
            cache.exportFile(file),
          )
          rememberCandidates(
            JSON.stringify(['lexical', file]),
            file,
            scanTailwindOrderCandidates(source),
          )
        }
        updateUniverse()
        await resolveStylexRequests(
          stylexModules,
          stylexModules.resolutionRequests(),
          async (specifier, importer) => {
            const resolved = await this.resolve(specifier, importer, { skipSelf: true })
            return resolved?.id
          },
        )
        current.compiler.setStylexModules(stylexModules.moduleSources())
        includedFiles = new Set(project.files)
        candidateCssPath = path.join(project.dir, 'candidates.css')
        preflightPath = preflightCssPath(project.dir)
        // Read once for the process rather than per write: it is a file on
        // disk that cannot change under a running build.
        preflight = preflightCss()
        await refreshCandidates((message) => this.warn(message))
        if (options.debug) {
          this.info(scanSummary(project.stats))
        }
      },

      async watchChange(id, change) {
        const absolute = path.resolve(id)
        for (const [requestId, request] of requests) {
          if (request.file === absolute) requests.delete(requestId)
        }
        let orderChanged = false
        for (const [key, entry] of orderingSources) {
          // Keep the lexical seed until the replacement source arrives:
          // an unrelated code edit should not drop/re-add every static name
          // and rebuild the whole project's namespace twice.
          if (
            entry.file === absolute &&
            (change.event === 'delete' || key.startsWith('["actual",'))
          ) {
            orderingSources.delete(key)
            orderChanged = true
          }
        }
        // Dependencies can sit outside the project. During acquisition,
        // conservatively invalidate root CSS edits before imports are known.
        const dependency =
          epoch?.watchFiles.includes(absolute) ??
          discoveryPaths(root, options.css).includes(absolute)
        if (
          dependency ||
          (!epoch?.snapshot &&
            path.extname(absolute) === '.css' &&
            !absolute.endsWith('.hozo.css') &&
            absolute !== candidateCssPath &&
            absolute !== preflightPath)
        ) {
          epochGeneration++
          epoch?.invalidate()
          epoch = undefined
          pendingEpoch = undefined
          const next = await currentEpoch((message) => this.warn(message))
          for (const file of next.watchFiles) this.addWatchFile?.(file)
          await refreshCandidates((message) => this.warn(message))
          invalidateTransforms()
          return
        }
        // Without this a deleted file's classes would stay in the stylesheet
        // for as long as the cache file survives, since nothing else ever
        // revisits an entry that stopped being scanned.
        if (change.event === 'delete') {
          const absolute = path.resolve(id)
          includedFiles.delete(absolute)
          for (const moduleId of transformedIds) {
            if (path.resolve(moduleId.split('?')[0]!) === absolute) transformedIds.delete(moduleId)
          }
          if (cache?.forget(absolute)) orderChanged = true
          if (stylexModules?.forget(absolute)) {
            epoch?.compiler.setStylexModules(stylexModules.moduleSources())
          }
        }
        if (orderChanged && updateUniverse()) {
          await refreshCandidates((message) => this.warn(message))
          invalidateTransforms()
        }
        if (change.event === 'create') {
          const absolute = path.resolve(id)
          const relative = path.relative(root, absolute).replaceAll('\\', '/')
          if (
            discoverSources(root, { ...options.content, include: [relative] }).includes(absolute)
          ) {
            includedFiles.add(absolute)
          }
        }
      },

      // Everything a project wrote itself, before any other plugin has had
      // it. `enforce: 'pre'` is what makes `code` the source as written.
      ...pass((file) => !isTransformedSource(file)),

      moduleParsed(module) {
        inventory?.moduleParsed(module)
      },

      async buildEnd(error) {
        cache?.persist()
        stylexModules?.persist()
        if (!inventory) return
        if (error) {
          finalStylesGraph?.dispose()
          writeFileIfChanged(finalStylesPath, JSON.stringify(finalStylesState('failed')))
          writeFileIfChanged(
            inventoryPath,
            JSON.stringify({ schema: 1, status: 'failed', finalOrderingReady: false }),
          )
          return
        }
        // The source walk and the bundler graph are different authorities:
        // configured authored content remains even when not imported, while
        // derived-module observations survive only if their full IDs do.
        const authored = discoverSources(root, options.content).map((file) => ({
          id: JSON.stringify(['authored', file]),
          revision: contentRevision(readFileSync(file, 'utf8')),
        }))
        const modules = [...this.getModuleIds()]
          .filter((id) => scannableFile(id, (file) => includedFiles.has(file)))
          .map((id) => {
            const module = this.getModuleInfo(id)
            return { id, code: module?.code ?? null, meta: module?.meta ?? {} }
          })
        writeFileIfChanged(
          inventoryPath,
          `${JSON.stringify(inventory.reconcile(authored, modules), null, 2)}\n`,
        )
        const graph = finalStylesGraph
        const current = epoch
        const generation = epochGeneration
        if (!graph || !current?.snapshot) return
        const ownsPublication = () =>
          generation === epochGeneration && epoch === current && finalStylesGraph === graph
        try {
          const result = await graph.publish(
            modules,
            inventory.publicationInputs(authored, modules),
            async (names, signal) => {
              const order = await current.snapshot!.prepareOrder(names)
              current.check()
              signal?.throwIfAborted()
              return JSON.stringify(order.snapshot)
            },
            current.theme,
            () => ownsPublication() && current.isCurrent(),
          )
          // Vite has already processed the companion imports. These final
          // styles are a sealed build artifact, not a silent rewrite of files
          // whose older contents are already inside a CSS asset. Late asset
          // delivery and coordinated activation are the next boundary.
          if (ownsPublication())
            writeFileIfChanged(finalStylesPath, `${JSON.stringify(result, null, 2)}\n`)
        } catch (failure) {
          if (ownsPublication())
            writeFileIfChanged(finalStylesPath, JSON.stringify(finalStylesState('failed')))
          throw failure
        }
      },
      closeBundle(error) {
        if (error && inventory)
          writeFileIfChanged(finalStylesPath, JSON.stringify(finalStylesState('failed')))
        finalStylesGraph?.dispose()
        finalStylesGraph = undefined
        epochGeneration++
        epoch?.invalidate()
        epoch = undefined
        pendingEpoch = undefined
        requests.clear()
        transformedIds.clear()
        orderingSources.clear()
        inventory = undefined
      },
      renderError() {
        // Retire observed render errors too, but this is not a whole-bundle
        // certificate: later hooks can fail without this callback firing.
        finalStylesGraph?.dispose()
        if (inventory)
          writeFileIfChanged(finalStylesPath, JSON.stringify(finalStylesState('failed')))
      },
    },
    transformed,
  ]
}
