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
import { scanTailwindOrderCandidates } from '@hozo/compiler'
import { formatDiagnostic, reportDiagnostics } from '@hozo/compiler/diagnostics'
import { type LowerModuleOptions, sideEffectImport } from '@hozo/compiler/lower'
import {
  CACHE_DIR,
  checksRuntimeClasses,
  classesMissingFromRuntimeMap,
  discoverSources,
  type FileFactStore,
  findClassHelpers,
  type HozoProjectOptions,
  importSpecifier,
  isTransformedSource,
  type OwnerContractRequest,
  resolveClassHelpers,
  resolveStylexRequests,
  type StylexModuleCache,
  scannableFile,
  scanProject,
  scanSummary,
  TailwindPreparationCancelled,
  withOwnerPackageCandidates,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import type { Plugin, ResolvedConfig } from 'vite'
import { contentRevision, ViteCandidateInventory } from './candidate-inventory.ts'
import { injectedDependencies } from './injected-deps.ts'
import type { ViteOwnerCandidatePlan } from './owner-candidates.ts'
import {
  type ViteModuleResolve,
  type ViteOwnerPreflightPolicy,
  ViteOwnerSession,
} from './owner-session.ts'
import { ViteStylesheetSession } from './stylesheet-session.ts'
import {
  finalizeTransformedSource,
  lowerWithNamespaceRetry,
  syncStylexModuleGraph,
  unfoldTransformedSource,
  writeFailedInventory,
} from './transform-helpers.ts'

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
  return configureHozo(options)
}

/** @internal Explicit candidate-only BUILD experiment. No normal-option or
 * default change, owner/helper/text installation or automatic root discovery.
 */
export function hozoWithOwnerCandidates(
  options: HozoOptions,
  plan: ViteOwnerCandidatePlan,
): Plugin[] {
  return configureHozo(options, plan)
}

export interface ViteOwnerCallerPlan extends ViteOwnerCandidatePlan {
  /** Optional finite subset. Omit to derive possible bindings from the capture. */
  callers?: readonly Omit<OwnerContractRequest, 'entry'>[]
}

/** @internal Explicit BUILD assessment through the ordinary transform/CSS
 * publication path. No new public option or default owner/audit admission.
 */
export function hozoWithOwnerCallers(options: HozoOptions, plan: ViteOwnerCallerPlan): Plugin[] {
  if (plan.callers === undefined) return configureHozo(options, plan, [], true)
  if (!plan.callers.length || plan.callers.length > 64)
    throw new Error('[hozo] owner caller binding budget unavailable')
  const callers = plan.callers.map((caller) => Object.freeze({ ...caller }))
  if (
    new Set(
      callers.map((caller) =>
        JSON.stringify([caller.importer, caller.specifier, caller.imported, caller.classProp]),
      ),
    ).size !== callers.length
  )
    throw new Error('[hozo] duplicate owner caller binding')
  return configureHozo(options, plan, callers)
}

/** @internal BUILD assessment from the existing configured source set. The
 * old scan stays; static traversal is bounded, dynamic/derived coverage is not assumed.
 */
export function hozoWithDiscoveredOwnerCallers(
  options: HozoOptions,
  preflight: ViteOwnerPreflightPolicy = 'strict',
): Plugin[] {
  if (!['strict', 'ordinary-fallback'].includes(preflight))
    throw new Error('[hozo] invalid owner preflight policy')
  return configureHozo(options, undefined, [], true, true, preflight)
}

function configureHozo(
  options: HozoOptions,
  ownerPlan?: ViteOwnerCandidatePlan,
  callerBindings: readonly Omit<OwnerContractRequest, 'entry'>[] = [],
  discoverCallers = false,
  discoverOwnerSources = false,
  ownerPreflight: ViteOwnerPreflightPolicy = 'strict',
): Plugin[] {
  let root = process.cwd()
  let resolvedConfig: ResolvedConfig | undefined
  let stylexModules: StylexModuleCache
  // Decision 014's per-file records, from buildStart's scan. Undefined until
  // then, and for a transform with no scan, which then reads as before.
  let facts: FileFactStore | undefined
  let includedFiles = new Set<string>()
  // `content: { include: [] }` declares that no file's plain classes are
  // Hozo's to style: the project generates their CSS some other way, such as
  // Tailwind's own plugin during a migration. Every file is then outside the
  // walk on purpose, and Hozo cannot see the rules that style its classes, so
  // the missing-class check would report every class in the project (#2250).
  const walksNothing = options.content?.include?.length === 0
  // Tailwind's own Vite plugin, beside this one, generates a rule for every
  // class written in the sources it scans, whether or not Hozo walks them.
  // A class outside Hozo's walk is then not missing, so the same check is
  // off. Set from the resolved config; a project without that plugin keeps
  // the check exactly as before.
  let tailwindStylesClasses = false
  let inventory: ViteCandidateInventory | undefined
  let inventoryPath = ''
  const requests = new Map<string, { token: symbol; file: string }>()

  const stylesheets = new ViteStylesheetSession(options)
  const ownerSession = new ViteOwnerSession({
    ownerPlan,
    callerBindings,
    discoverCallers,
    discoverOwnerSources,
    ownerPreflight,
  })

  // Which files under `node_modules` the transform compiles and scans.
  const admitted = (file: string) => includedFiles.has(file) || ownerSession.admits(file)

  const refreshCandidates = (warn: (message: string) => void) =>
    stylesheets.refreshCandidates(root, warn, stylexModules, () =>
      ownerSession.validateBeforePublish(),
    )

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
      const file = scannableFile(id, admitted)
      if (!file || !accepts(file)) return

      const request = Symbol(id)
      const checkOwnerEpoch = ownerSession.captureRequestGuard()
      const requestId = JSON.stringify([this.environment?.name ?? 'default', id])
      const absoluteFile = path.resolve(file)
      requests.set(requestId, { token: request, file: absoluteFile })
      const checkRequest = () => {
        checkOwnerEpoch()
        if (requests.get(requestId)?.token !== request)
          throw new TailwindPreparationCancelled('TAILWIND_MODULE_SUPERSEDED')
      }
      const resolveModule: ViteModuleResolve = (specifier, importer) =>
        this.resolve(specifier, importer, { skipSelf: true })
      const warn = (message: string) => this.warn(message)

      try {
        const isDerivedModule = id.includes('?')
        let candidateMeta: Record<string, unknown> | undefined = isDerivedModule
          ? inventory?.transformDerivedMeta(id, code)
          : undefined
        let stylexGraphChanged = false
        // A transformed source is not in the project walk -- see
        // `TRANSFORMABLE` -- so it has to be admitted here or its classes
        // would never reach the candidate set at all.
        const scannable = !isDerivedModule && (admitted(absoluteFile) || isTransformedSource(file))
        if (scannable) {
          // For the `pre` pass `code` is still the source as written, which
          // is what the scanner expects. For the second pass it is the JSX
          // another plugin produced, which is the first form of that file
          // the scanner *can* read. Keyed by the same absolute path
          // `scanProject`'s walk used, so a file scanned there isn't
          // recorded twice under two spellings.
          const modifiedMs = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0
          const cacheChanged = stylesheets.cache.scanFile(absoluteFile, code, modifiedMs)
          // Capture the facts belonging to this exact input before any await
          // can let another module revise the shared physical-file entry.
          if (inventory) {
            const record = stylesheets.cache.exportFile(absoluteFile)
            if (record) candidateMeta = inventory.transformMeta(id, code, record)
          }
          const sourceChanged = stylesheets.rememberCandidates(
            JSON.stringify(['lexical', file]),
            file,
            scanTailwindOrderCandidates(code),
          )
          const orderChanged = (cacheChanged || sourceChanged) && stylesheets.updateUniverse()
          if (orderChanged) stylesheets.invalidateTransforms()
          if (cacheChanged || orderChanged) {
            // Do not publish a provisional sheet or let a late old order
            // overwrite the current candidate revision.
            await refreshCandidates(warn)
            checkRequest()
          }
          stylexGraphChanged = stylexModules.scanFile(absoluteFile, code, modifiedMs)
        }

        const current = await stylesheets.currentEpoch(root, warn, stylexModules)
        checkRequest()
        const compiler = current.compiler
        if (
          !scannable &&
          !isDerivedModule &&
          !walksNothing &&
          !tailwindStylesClasses &&
          checksRuntimeClasses(file)
        ) {
          // Outside the walk, so its classes never reach the candidate
          // stylesheet: one resolved at run time has no rule (#2048).
          for (const diagnostic of classesMissingFromRuntimeMap(
            code,
            file,
            new Set(stylesheets.cache.candidates()),
            compiler,
            options.sources,
            options.markerClasses,
          ))
            this.warn(formatDiagnostic(diagnostic))
        }

        await syncStylexModuleGraph(
          stylexModules,
          compiler,
          absoluteFile,
          code,
          stylexGraphChanged,
          resolveModule,
        )

        let source = code
        let jsxImportSource: string | undefined
        if (isTransformedSource(file)) {
          ;({ source, jsxImportSource } = unfoldTransformedSource(code, file, compiler, warn))
        }

        // The project's own class-joining functions this file calls (#964),
        // found through Vite's own resolution and watched, so editing the
        // helper re-transforms its callers. Set immediately before lowering,
        // with no await in between: the compiler is shared by every file.
        const helpers = await findClassHelpers(
          source,
          absoluteFile,
          async (specifier, importer) => {
            const resolved = await resolveModule(specifier, importer)
            return resolved?.external ? undefined : resolved?.id
          },
          (dependency) => this.addWatchFile(dependency),
          // The helper files' records from the scan, re-read only on change.
          facts,
        )
        const auditedOwners = await ownerSession.resolveAuditedOwners(
          source,
          absoluteFile,
          resolveModule,
        )
        compiler.setClassHelpers(resolveClassHelpers(options.classHelpers, helpers))
        checkRequest()
        current.check()

        // Helpers are installed immediately before the actual parse. StyleX
        // registry changes are installed only when its graph/epoch changes,
        // not rebuilt for every warm file. Actual parsed candidates, rather
        // than an early lexical scan alone, decide context completeness.
        const policy: LowerModuleOptions = {
          unloweredReactNativeJsx: options.unloweredReactNativeJsx,
          auditedOwners,
        }
        const { lowered, ownerDelivery } = await lowerWithNamespaceRetry({
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
          reinstallHelpers: () =>
            compiler.setClassHelpers(resolveClassHelpers(options.classHelpers, helpers)),
          checkRequest,
        })
        if (ownerDelivery) candidateMeta = { ...candidateMeta, hozoOwnerDelivery: ownerDelivery }

        if (stylesheets.sheetUniverseKey !== stylesheets.universe.key) await refreshCandidates(warn)
        current.check()
        checkRequest()
        const admission = ownerSession.admissionMeta()
        if (admission) candidateMeta = { ...candidateMeta, hozoOwnerAdmission: admission }
        if (!lowered) return candidateMeta ? { meta: candidateMeta } : undefined

        // Shared with Metro and Next, which is new: this warned on
        // everything including error-severity diagnostics, and Metro threw.
        // The difference looked deliberate and wasn't -- every error Hozo
        // can emit today comes from the Native backend, so this had simply
        // never been handed one.
        reportDiagnostics(lowered.diagnostics, file, warn)

        writeFileIfChanged(lowered.cssPath, lowered.css)
        // Imported from every lowered file rather than from one designated
        // entry: the candidate sheet has to be present whichever module the
        // dynamic className lives in, and Vite resolves the repeated import
        // to a single module in the graph.
        // First of the three: element selectors lose to every utility on
        // specificity, so a base layer that landed after them would be a
        // base layer with no effect on the cases it exists for.
        const next =
          sideEffectImport(importSpecifier(file, stylesheets.preflightPath)) +
          sideEffectImport(`./${lowered.cssFileName}`) +
          sideEffectImport(importSpecifier(file, stylesheets.candidateCssPath)) +
          lowered.code

        if (isTransformedSource(file) && resolvedConfig) {
          const compiled = await finalizeTransformedSource(
            next,
            file,
            jsxImportSource,
            resolvedConfig,
          )
          current.check()
          checkRequest()
          stylesheets.recordTransformed(id)
          return { code: compiled.code, map: compiled.map ?? null, meta: candidateMeta }
        }

        stylesheets.recordTransformed(id)
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
   * Step 3 is this pass too -- see `finalizeTransformedSource` -- which is
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

      config(config) {
        const include = injectedDependencies(path.resolve(options.root ?? config.root ?? '.'))
        return include.length > 0 ? { optimizeDeps: { include } } : undefined
      },

      configResolved(config) {
        ownerSession.assertBuildCommand(config.command)
        root = options.root ?? config.root
        resolvedConfig = config
        // `@tailwindcss/vite` registers `:scan` and `:generate:*` plugins.
        // Optional because a caller driving the hooks directly may hand in a
        // partial config, as this package's own tests do.
        tailwindStylesClasses =
          config.plugins?.some((plugin) => plugin.name.startsWith('@tailwindcss/vite:')) ?? false
      },

      configureServer(devServer) {
        stylesheets.setServer(devServer)
      },

      async buildStart() {
        ownerSession.reset()
        stylesheets.invalidateEpoch()

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
          writeFileIfChanged(
            inventoryPath,
            JSON.stringify({ schema: 1, status: 'collecting', finalOrderingReady: false }),
          )
        }

        const warn = (message: string) => this.warn(message)
        const current = await stylesheets.currentEpoch(root, warn, stylexModules)
        const discoveredProject = await ownerSession.initialize({
          root,
          options,
          resolvedConfig,
          current,
          inventory,
          resolve: (specifier, importer) => this.resolve(specifier, importer, { skipSelf: true }),
          addWatchFile: (file) => this.addWatchFile(file),
          warn,
        })
        for (const dependency of current.watchFiles) this.addWatchFile(dependency)

        // The whole project, not just what the bundler happens to reach: a
        // class can be produced by a module the graph never resolves
        // statically.
        const project =
          (ownerSession.hasCarriers() ? undefined : discoveredProject) ??
          scanProject(root, options.content, options.sources, ownerSession.carrierContributions())
        const ownerContributions = ownerSession.ownerContributions()
        const cache = ownerContributions
          ? withOwnerPackageCandidates(project, ownerContributions, options.sources)
          : project.cache
        stylesheets.initProject(project.dir, cache)
        stylexModules = project.stylexModules
        facts = project.facts

        // Ordering names from the scan's own records, not a second read
        // (decision 014). Only the experimental inventory still wants source.
        for (const file of project.files) {
          if (inventory)
            inventory.observeAuthored(
              JSON.stringify(['authored', file]),
              readFileSync(file, 'utf8'),
              cache.exportFile(file),
            )
          stylesheets.rememberCandidates(
            JSON.stringify(['lexical', file]),
            file,
            project.facts.get(file)?.order ?? [],
          )
        }
        // The captured carriers' source, which this build compiles: in the
        // ordering seed before the first transform, as the walk's files are.
        for (const file of ownerSession.carrierSourceFiles())
          stylesheets.rememberCandidates(
            JSON.stringify(['lexical', file]),
            file,
            project.facts.get(file)?.order ?? [],
          )
        project.facts.persist()
        stylesheets.updateUniverse()
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
        await refreshCandidates(warn)
        if (options.debug) {
          this.info(scanSummary(project.stats))
        }
      },

      async watchChange(id, change) {
        const ownerChange = ownerSession.handleWatchChange(id)
        if (ownerChange === 'owner-input-changed') {
          stylesheets.invalidateTransforms()
          return
        }
        if (ownerChange === 'handled') return

        const absolute = path.resolve(id)
        for (const [requestId, request] of requests) {
          if (request.file === absolute) requests.delete(requestId)
        }
        let orderChanged = stylesheets.dropOrderingForFile(absolute, change.event === 'delete')
        if (stylesheets.isStylesheetDependency(absolute, root)) {
          stylesheets.invalidateEpoch()
          const warn = (message: string) => this.warn(message)
          const next = await stylesheets.currentEpoch(root, warn, stylexModules)
          for (const file of next.watchFiles) this.addWatchFile?.(file)
          await refreshCandidates(warn)
          stylesheets.invalidateTransforms()
          return
        }
        // Without this a deleted file's classes would stay in the stylesheet
        // for as long as the cache file survives, since nothing else ever
        // revisits an entry that stopped being scanned.
        if (change.event === 'delete') {
          includedFiles.delete(absolute)
          if (stylesheets.forgetDeletedFile(absolute)) orderChanged = true
          if (stylexModules?.forget(absolute)) {
            stylesheets.epoch?.compiler.setStylexModules(stylexModules.moduleSources())
          }
        }
        if (orderChanged && stylesheets.updateUniverse()) {
          await refreshCandidates((message) => this.warn(message))
          stylesheets.invalidateTransforms()
        }
        if (change.event === 'create') {
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

      // Every module Vite loads, in a build and in the dev server, passes
      // here before it can reach output. A package with a manifest that the
      // capture at buildStart did not hold would ship classes with no rules,
      // so the build stops and names it. Nothing is loaded here.
      load(id) {
        const message = ownerSession.guardLoad(id)
        if (message) this.error(message)
        return null
      },

      moduleParsed(module) {
        inventory?.moduleParsed(module)
      },

      async buildEnd(error) {
        stylesheets.persistCache()
        stylexModules?.persist()
        if (!inventory) return
        if (error) {
          ownerSession.invalidateOwners()
          writeFailedInventory(inventoryPath)
          return
        }
        if (ownerSession.hasActiveGraphGuard()) {
          try {
            ownerSession.validateGraph(this, root, options.content)
          } catch (error) {
            writeFailedInventory(inventoryPath)
            throw error
          }
        }
        // The source walk and the bundler graph are different authorities:
        // configured authored content remains even when not imported, while
        // derived-module observations survive only if their full IDs do.
        const authored = discoverSources(root, options.content).map((file) => ({
          id: JSON.stringify(['authored', file]),
          revision: contentRevision(readFileSync(file, 'utf8')),
        }))
        const modules = [...this.getModuleIds()]
          .filter((id) => scannableFile(id, admitted))
          .map((id) => {
            const module = this.getModuleInfo(id)
            return { id, code: module?.code ?? null, meta: module?.meta ?? {} }
          })
        writeFileIfChanged(
          inventoryPath,
          `${JSON.stringify(inventory.reconcile(authored, modules), null, 2)}\n`,
        )
      },

      generateBundle: {
        order: 'post',
        handler() {
          try {
            ownerSession.validateGraph(this, root, options.content)
          } catch (error) {
            if (inventory) writeFailedInventory(inventoryPath)
            throw error
          }
        },
      },

      closeBundle() {
        ownerSession.reset()
        stylesheets.resetForClose()
        requests.clear()
        inventory = undefined
      },
    },
    transformed,
  ]
}
