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

import { statSync } from 'node:fs'
import path from 'node:path'
import { type CandidateCache, type Compiler, createCompiler, type Theme } from '@hozo/compiler'
import { reportDiagnostics } from '@hozo/compiler/diagnostics'
import { lowerModule, sideEffectImport } from '@hozo/compiler/lower'
import {
  discoverSources,
  type HozoProjectOptions,
  importSpecifier,
  isTransformedSource,
  preflightCssFor,
  preflightCssPath,
  resolveStylexRequests,
  type StylexModuleCache,
  scannableFile,
  scanProject,
  scanSummary,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { loadProjectClassOrder, loadProjectTheme, preflightCss } from '@hozo/tailwind'
import { type Plugin, type ResolvedConfig, transformWithOxc, type ViteDevServer } from 'vite'

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
  let theme: Theme | undefined
  // Built once the theme is known and reused for every file after, so the
  // palette crosses the addon boundary at `buildStart` rather than on every
  // module. See `createCompiler`.
  let compiler: Compiler
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

  /// Regenerates the project-wide candidate stylesheet and, in dev, makes
  /// the already-loaded module pick it up. The file lives under
  /// `node_modules`, which Vite's watcher ignores by default, so the
  /// invalidation has to be explicit rather than left to the watcher.
  function writeCandidateCss() {
    // Before the invalidation below, not after: the two stylesheets are
    // one update, and a reload that saw only half of it would be a page
    // styled against the previous answer.
    writePreflightCss()
    if (!writeFileIfChanged(candidateCssPath, cache.renderCss(theme, classOrder))) return false
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
    const css = preflightCssFor(options.preflight, preflight, cache.usesTailwind)
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
      const file = scannableFile(id)
      if (file && !accepts(file)) return
      const isDerivedModule = id.includes('?')
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
        if (cache.scanFile(path.resolve(file), code, modifiedMs)) {
          // Written once with the order as it stands, then again once
          // Tailwind has placed the new candidates. Without the second
          // pass a class added while the server is up is written last
          // whatever its breakpoint, and `sm:block` would outrank a
          // `md:hidden` that had been there all along.
          writeCandidateCss()
          void loadProjectClassOrder(root, cache.candidates(), { css: options.css }).then(
            (next) => {
              classOrder = next
              writeCandidateCss()
            },
          )
        }
        stylexGraphChanged = stylexModules.scanFile(path.resolve(file), code, modifiedMs)
      }

      if (!file) return
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
      const lowered = lowerModule(code, id, file, compiler, root, stylexModules)
      if (!lowered) return

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
          undefined,
          undefined,
          resolvedConfig,
        )
        return { code: compiled.code, map: compiled.map ?? null }
      }

      return { code: next, map: null }
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
        theme = await loadProjectTheme(root, {
          css: options.css,
          warn: (message) => this.warn(message),
        })
        compiler = createCompiler(theme, options.sources)

        // The whole project, not just what the bundler happens to reach: a
        // class can be produced by a module the graph never resolves
        // statically.
        const project = scanProject(root, options.content)
        classOrder = await loadProjectClassOrder(root, project.cache.candidates(), {
          css: options.css,
        })
        cache = project.cache
        stylexModules = project.stylexModules
        await resolveStylexRequests(
          stylexModules,
          stylexModules.resolutionRequests(),
          async (specifier, importer) => {
            const resolved = await this.resolve(specifier, importer, { skipSelf: true })
            return resolved?.id
          },
        )
        compiler.setStylexModules(stylexModules.moduleSources())
        includedFiles = new Set(project.files)
        candidateCssPath = path.join(project.dir, 'candidates.css')
        preflightPath = preflightCssPath(project.dir)
        // Read once for the process rather than per write: it is a file on
        // disk that cannot change under a running build.
        preflight = preflightCss()
        writeCandidateCss()
        if (options.debug) {
          this.info(scanSummary(project.stats))
        }
      },

      watchChange(id, change) {
        // Without this a deleted file's classes would stay in the stylesheet
        // for as long as the cache file survives, since nothing else ever
        // revisits an entry that stopped being scanned.
        if (change.event === 'delete') {
          const absolute = path.resolve(id)
          includedFiles.delete(absolute)
          if (cache?.forget(absolute)) writeCandidateCss()
          if (stylexModules?.forget(absolute)) {
            compiler.setStylexModules(stylexModules.moduleSources())
          }
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

      buildEnd() {
        cache?.persist()
        stylexModules?.persist()
      },
    },
    transformed,
  ]
}
