// Project-wide source discovery and candidate-cache reconciliation, shared
// by the Vite and Metro integrations.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { readAnalysisAliases } from './analysis-config.ts'
import type { CarrierClosure } from './carrier-closure.ts'
import { FileFactStore } from './file-facts.ts'
import {
  type CandidateCache,
  type ClassHelper,
  type CompileDiagnostic,
  type Compiler,
  classHelperCandidates,
  type FontAvailability,
  openCandidateCache,
  type StylexExternalBinding,
  type TextForwardingModule,
} from './index.ts'
import { buildManifest, textForwardingModule } from './manifest.ts'
import { withOwnerPackageCandidates } from './owner-package-candidates.ts'
import type { OwnerPackageContributions } from './owner-package-contributions.ts'
import { StylexModuleCache, type StylexResolutionRequest } from './stylex-project.ts'
import { TAILWIND_MERGE_CONFIG, TAILWIND_MERGE_ENTRY_DIGESTS } from './tw-merge-config.ts'
import { inheritedGitIgnoredSync, walkFiles } from './walk.ts'

export { readBoundedUtf8File } from './bounded-data.ts'
export {
  type CandidateContribution,
  type ExpectedCandidateSource,
  type RuntimeCandidateReconciliation,
  reconcileRuntimeCandidateContributions,
} from './candidate-reconciliation.ts'
export {
  type CarrierClosure,
  type CarrierClosureOptions,
  type CarrierInstance,
  type CarrierOwnerSnapshot,
  type CarrierTrip,
  captureCarrierClosure,
  carrierGuard,
  carrierIncompleteMessage,
  carrierOwnerRoutes,
  carrierSources,
  carrierTripMessage,
  locateDeclaredPackage,
  requireCarrierClosure,
  restoreCarrierOwnerRoutes,
} from './carrier-closure.ts'
export { FILE_FACTS_SCHEMA, FileFactStore, type FileFacts, fileFacts } from './file-facts.ts'
export { prepareInstanceOwnerCallers } from './owner-caller-participant.ts'
export {
  type InstanceOwnerCallerPreview,
  InstanceOwnerCallerProject,
} from './owner-caller-project.ts'
// Internal shadow adapter boundary, not a default manifest-v2 consumer.
export {
  captureOwnerManifests,
  type OwnerImportEdge,
  type OwnerManifestCapture,
  type OwnerManifestObservation,
} from './owner-manifest-capture.ts'
export { OwnerManifestEpoch, type OwnerManifestLease } from './owner-manifest-epoch.ts'
export { type ResolvedOwnerInstance, readResolvedOwnerManifest } from './owner-manifest-read.ts'
export {
  type HozoPackageManifest,
  OWNER_PACKAGE_SCHEMA,
  type OwnerPackageShadow,
  parseOwnerPackageShadow,
} from './owner-package.ts'
export {
  ownerPackageCandidateContribution,
  withOwnerPackageCandidates,
} from './owner-package-candidates.ts'
export {
  collectOwnerPackageContributions,
  type OwnerPackageContributions,
} from './owner-package-contributions.ts'
export {
  locateResolvedOwnerPackage,
  type OwnerMetadataBoundary,
  type OwnerPackageLocation,
} from './owner-package-location.ts'
export {
  discoverOwnerPackageCallers,
  type OwnerCallerDiscovery,
  type OwnerContractIdentity,
  type OwnerContractRequest,
  type OwnerContractSelection,
  selectOwnerPackageContract,
} from './owner-package-selection.ts'
export {
  type CachedStylexModule,
  StylexModuleCache,
  type StylexResolutionRequest,
  type StylexResolvedBindings,
} from './stylex-project.ts'
export {
  type CollectedTailwindModule,
  emitFinalTailwindBatch,
  type FinalTailwindBatch,
  type FinalTailwindBatchRequest,
  TailwindBatchIncomplete,
} from './tailwind-final-batch.ts'
export { emitTailwindModules } from './tailwind-project.ts'
export {
  TailwindCandidateUniverse,
  type TailwindModuleAttempt,
  TailwindPreparationCancelled,
  TailwindProjectSession,
} from './tailwind-session.ts'

/** Extensions the project walk reads from disk. */
const SCANNABLE = new Set(['.tsx', '.jsx', '.ts', '.js', '.mts', '.mjs'])

/**
 * Extensions a bundler may hand to a transform, which is a wider set.
 *
 * `.mdx` is here and deliberately *not* in `SCANNABLE`. On disk an `.mdx`
 * file is Markdown, which does not parse as TypeScript, so the candidate
 * scan would fall back to a plain byte scan over prose -- the exact thing
 * subtracting comments, JSX text and string-literal children removed. By
 * the time a bundler hands the file over, the MDX transform has produced
 * JSX, which parses, and the subtraction works again.
 *
 * The cost is that an `.mdx` file no bundler reaches contributes no
 * candidates. That file is also not in the output, so there is nothing it
 * could have left unstyled.
 */
const TRANSFORMABLE = new Set([...SCANNABLE, '.mdx'])
const DEFAULT_INCLUDE = ['**/*.{tsx,jsx,ts,js,mts,mjs}']
const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.turbo/**',
  '**/.expo/**',
  '**/target/**',
  '**/temp/**',
  '**/tmp/**',
  '**/vendor/**',
  '**/.generated/**',
]

export const CACHE_DIR = path.join('node_modules', '.hozo')
/** Decision 014's per-file records, beside the candidate cache. */
export const FILE_FACTS_FILE = 'file-facts.json'

export interface ContentOptions {
  /**
   * Globs relative to the project root.
   *
   * Supplying this turns gitignore off for the walk: naming a path is the
   * project saying which files these are, and gitignore answers a
   * different question -- what to commit. A generated token module is
   * often both untracked and worth scanning. `exclude` and the built-in
   * ignores still apply.
   */
  include?: string[]
  /** Additional ignore globs relative to the project root. */
  exclude?: string[]
  /**
   * Read `.gitignore` while walking, including the ones above the project.
   * Defaults to true, and has no effect alongside `include`.
   */
  respectGitignore?: boolean
  /**
   * Installed packages whose own source is scanned as well as the project's,
   * as Tailwind's `@source` can name a path in `node_modules`.
   *
   * Unset, no package source is walked. A package that declares
   * `hozo.manifest` contributes its candidates from that manifest, captured
   * at startup (#2047, decision 012 point 4). This option is for a library
   * without a manifest that still has classes in its source. Naming any
   * package also turns that capture off, so a project that sets it lists
   * every package it wants read, and `[]` means none.
   */
  packages?: string[]
}

export type UnloweredReactNativeJsxPolicy = 'allow' | 'warn' | 'error'

/**
 * Options whose meaning is shared by every Hozo bundler integration.
 *
 * All four accept exactly these and add nothing, which is the point: a
 * project moving between Vite, Next, Metro and Storybook should not have
 * to learn a second spelling of the same question. `root` in particular
 * was `projectRoot` in one of them and absent from two others.
 */
export interface HozoProjectOptions {
  /**
   * The stylesheet carrying `@import "tailwindcss"` and the project's
   * `@theme`, relative to the project root.
   *
   * Left out, Hozo looks for the usual names and falls back to Tailwind's
   * default theme if it finds none -- reporting what it looked for rather
   * than silently compiling against the wrong palette. The file is read
   * for its tokens and never bundled: Hozo compiles the utilities itself,
   * so a project needs no Tailwind pipeline of its own.
   */
  css?: string
  /** Source globs and ignores used by the project-wide candidate scan. */
  content?: ContentOptions
  /**
   * The project root. Each integration defaults this to whatever its
   * bundler already knows -- Vite's resolved root, Metro's `projectRoot`,
   * the working directory Next evaluates its config in.
   */
  root?: string
  /**
   * Modules whose primitives Hozo may lower.
   *
   * Defaults to `@hozo/core` and `react-native`. A project that re-exports
   * primitives through its own module adds it here; see
   * `@hozo/compiler/sources` for what the list decides and why it is not a
   * substring test.
   */
  sources?: readonly string[]
  /**
   * What to do when Web output still contains JSX backed directly
   * by React Native after Hozo lowering.
   *
   * - 'allow' (default): Allow unlowered JSX to be resolved at bundle time
   *   by a compatibility layer such as react-native-web.
   * - 'warn': Emit a build warning listing any unlowered React Native JSX elements.
   * - 'error': Fail the build if any direct React Native JSX remains in Web output.
   *
   * @default 'allow'
   */
  unloweredReactNativeJsx?: UnloweredReactNativeJsxPolicy
  /**
   * Whether the Web integrations emit Tailwind's base layer.
   *
   * Hozo compiles Tailwind's utilities, and those utilities are authored
   * against Preflight: `text-xl` assumes `h2` carries no size of its own,
   * `w-full` on an `<img>` assumes `max-width: 100%` is already there.
   * Shipping the utilities without the base is what makes images overflow
   * and links come out browser blue, and nothing in the class names says
   * so -- every class the project asked for is present.
   *
   * `'auto'`, the default, emits it when the project actually uses
   * Tailwind classes. A StyleX-only project gets nothing, and correctly:
   * StyleX styles are literal property values, so `{ fontSize: 16 }` is
   * 16px whatever the user-agent thinks `h2` should be. Preflight is an
   * opinionated reset, and a project with no stake in Tailwind's
   * assumptions should not be handed one.
   *
   * `true` always emits it, `false` never.
   *
   * Native reads the answer too, which it did not until #315. There is
   * nothing to reset on React Native -- no cascade, no user-agent
   * stylesheet -- but that is the reason: the defaults the Native backend
   * supplies for `Heading` and `Separator` were copied from a browser, and
   * a browser under Preflight is a different browser. An `h1` is 16px/400
   * with the reset and 32px/700 without it, an `hr` 1px against 2px. So
   * this option decides which of the two the phone is asked to match, and
   * a project that sets it for the Web sets it for both halves by setting
   * it once.
   */
  preflight?: boolean | 'auto'
  /**
   * Hoisted `@font-face` CSS to load before generated utilities.
   *
   * `createFontFaceCss` from `@hozo/typography/fonts` produces this value.
   * Keeping the integration string-based avoids making every compiler user
   * install the typography package or carrying a font registry at runtime.
   */
  fontFaceCss?: string
  /** Static font registration facts produced by `createFontAvailability`. */
  fontAvailability?: FontAvailability
  /** Report project-scan work and timing through the bundler's logger. */
  debug?: boolean
  /**
   * The project's own functions that join class strings as `clsx` does,
   * such as shadcn/ui's `cn` in `@/lib/utils` (#964).
   *
   * A pure joiner is read argument by argument, so a component's own classes
   * compile and an opaque argument can fall back on its own.
   *
   * `module` is the specifier as callers write it, and `name` the name
   * they import (`default` for a default import). `recognize: false`
   * keeps a function from being read this way even when it is found
   * automatically.
   *
   * A declaration without `merge` promises a pure join when discovery has
   * no evidence about the helper. For a merger, the bundler must establish
   * that the resolved implementation matches the generated conflict table.
   * The merger stays at runtime while that evidence is missing.
   */
  classHelpers?: readonly ClassHelperOption[]
  /**
   * How a Native `Text` inherits text styles from a container (decision 013).
   *
   * React Native's `Text` inherits only from an enclosing `Text`, never from
   * a `View`, so the compiler copies a container's text classes onto the
   * `Text` it can see. `'unified'`, the default, also covers what it cannot
   * see -- a component from another file, `children`, an expression -- by
   * reading the same seven fields at run time: an outermost `Text` that does
   * not set all of them reads the rest, and a container wraps only its
   * unseen children in a scope that renders no host.
   *
   * `'compiled'` keeps the copying alone, as earlier releases did: text
   * classes on a container stop at anything the compiler cannot see. Only
   * Metro reads this; the Web inherits through CSS.
   *
   * @default 'unified'
   */
  nativeTextInheritance?: NativeTextInheritance
  /**
   * Class names that are not meant to style anything: an app's own markers,
   * such as `js-row` or a name a test selects by (#2073).
   *
   * Each entry is an exact name, or a prefix ending in `*` (`'js-*'`). On
   * Native, a development build warns once about a class it is handed at
   * run time and cannot find in the project's map, because such a class
   * would otherwise just not apply. A name listed here is not warned about,
   * and neither are Tailwind's own `group` and `peer`. The build-time check
   * for classes missing from that map skips them too.
   */
  markerClasses?: readonly string[]
}

/**
 * Whether the check for classes missing from the run-time map should read
 * `file`. Not a dependency's files, whose classes the app's author cannot
 * change, as the compiler's own diagnostics treat `node_modules`, and not
 * built output (`dist`), which is never what anyone writes. In a workspace a
 * dependency is a symlink to its package's `dist`, so its path need not name
 * `node_modules`. Bundlers may also name a file relative to the root, so the
 * segment may start the path.
 */
export function checksRuntimeClasses(file: string): boolean {
  return !/(?:^|[\\/])(?:node_modules|dist)[\\/]/.test(file)
}

/** Whether `name` is one of the project's declared `markerClasses`. */
export function isMarkerClass(name: string, markers: readonly string[] = []): boolean {
  return markers.some((marker) =>
    marker.endsWith('*') ? name.startsWith(marker.slice(0, -1)) : name === marker,
  )
}

/**
 * The line a Metro candidate module ends with: in a development build, the
 * resolver warns about names its map lacks, apart from the declared markers.
 * Behind `__DEV__`, so a release build carries neither the call nor the list.
 */
export function unknownClassWarningLine(markers: readonly string[] = []): string {
  return `if (typeof __DEV__ !== 'undefined' && __DEV__) hozoClasses.warnUnknownClasses?.(${JSON.stringify(markers)})\n`
}

export type NativeTextInheritance = 'unified' | 'compiled'

export interface ClassHelperOption {
  module: string
  name: string
  /** `false` to keep this function from being read as a class joiner. */
  recognize?: boolean
  /** `true` when the helper resolves conflicts. Compilation needs resolved rules. */
  merge?: boolean
}

/**
 * The class-joining functions the compiler is given (#964): the ones found
 * in the project's source, plus the declared ones, minus the declared
 * `recognize: false`. A recognized merger keeps its resolved-rule evidence
 * even when the project also declares the helper.
 */
export function resolveClassHelpers(
  declared: readonly ClassHelperOption[] = [],
  found: readonly ClassHelper[] = [],
): ClassHelper[] {
  const key = (helper: { module: string; name: string }) => `${helper.module}\u0000${helper.name}`
  const refused = new Set(declared.filter((h) => h.recognize === false).map(key))
  const out = new Map<string, ClassHelper>()
  for (const helper of found) {
    if (!refused.has(key(helper))) out.set(key(helper), helper)
  }
  for (const helper of declared) {
    if (refused.has(key(helper))) continue
    const discovered = out.get(key(helper))
    const entry: ClassHelper = { module: helper.module, name: helper.name }
    if (helper.merge || discovered?.merge) entry.merge = true
    if (discovered?.mergeConfig) entry.mergeConfig = discovered.mergeConfig
    out.set(key(helper), entry)
  }
  return [...out.values()]
}

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/
const TW_MERGE_MODULE = 'tailwind-merge'

function mergeConfigForEntry(file: string | undefined, onDependency?: (file: string) => void) {
  if (!file || !path.isAbsolute(file) || /[?#]/.test(file)) return undefined
  onDependency?.(file)
  try {
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex')
    if (TAILWIND_MERGE_ENTRY_DIGESTS.includes(digest)) return TAILWIND_MERGE_CONFIG
  } catch {
    // A resolver may return a missing or virtual file. Preserve the call.
  }
  return undefined
}
// Helper files' records for a caller that has no project store: read again
// only when a file changes, as the in-process cache this replaced was.
const processFacts = new FileFactStore()

/**
 * The project's own class-joining functions this file calls, found by
 * following each candidate import to the file it resolves to (#964).
 *
 * `resolve` is the bundler's own resolution, so aliases such as `@/` mean
 * what they mean in the build. `onDependency` is told every file read, so a
 * bundler that can re-transform this file when one changes (Vite's
 * `addWatchFile`) does. The result goes through `resolveClassHelpers` with
 * the project's declarations, which win.
 *
 * `source` is the module as the bundler holds it, which is what its own
 * imports are read from. What a helper file exports comes from its record
 * (decision 014): the project's, when the bundler has one.
 */
export async function findClassHelpers(
  source: string,
  importer: string,
  resolve: (specifier: string, importer: string) => Promise<string | undefined>,
  onDependency?: (file: string) => void,
  facts: FileFactStore = processFacts,
): Promise<ClassHelper[]> {
  const found: ClassHelper[] = []
  for (const { specifier, imported } of classHelperCandidates(source)) {
    const resolved = await resolve(specifier, importer)
    if (specifier === TW_MERGE_MODULE && imported === 'twMerge') {
      const helper: ClassHelper = { module: specifier, name: imported, merge: true }
      const config = mergeConfigForEntry(resolved, onDependency)
      if (config) helper.mergeConfig = config
      found.push(helper)
      continue
    }
    if (!resolved || !path.isAbsolute(resolved) || /[?#]/.test(resolved) || !SCRIPT.test(resolved))
      continue
    onDependency?.(resolved)
    const summary = facts.get(resolved)
    if (summary?.helperExports.includes(imported)) {
      const helper: ClassHelper = { module: specifier, name: imported }
      if (summary.helperMerges.includes(imported)) {
        helper.merge = true
        const config = mergeConfigForEntry(await resolve(TW_MERGE_MODULE, resolved), onDependency)
        if (config) helper.mergeConfig = config
      }
      found.push(helper)
    }
  }
  return found
}

export interface ScanStats {
  discoveredFiles: number
  scannedFiles: number
  skippedFiles: number
  deletedFiles: number
  sourceBytes: number
  durationMs: number
}

export interface ProjectCache {
  cache: CandidateCache
  /** Exported StyleX facts for cross-file resolution, content-hash keyed. */
  stylexModules: StylexModuleCache
  /** One record per file, from the same read (decision 014). */
  facts: FileFactStore
  /** Absolute path of node_modules/.hozo, already created. */
  dir: string
  /** Whether the project-wide candidate set or StyleX module graph changed. */
  changed: boolean
  /** Absolute files admitted by this walk, for bundler watch filtering. */
  files: string[]
  stats: ScanStats
}

/**
 * The repository root at or above `from`, if the project sits in one.
 *
 * `.git` is a directory in an ordinary clone and a file in a worktree or a
 * submodule, so this asks whether the entry exists rather than what it is.
 */
function gitRootAbove(from: string): string | undefined {
  let dir = path.resolve(from)
  for (;;) {
    if (existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * A test for the ignores declared *above* the project.
 *
 * The walk's `gitignore` reads only the `.gitignore` files at or below the
 * directory it is handed, which in a monorepo is the one place they are
 * not: `storybook-static/`, `dist/`, `.next/` are declared once at the
 * repository root and inherited by every package. So `respectGitignore`
 * was on by default and, for a project scanned at its own directory,
 * silently did nothing about build output.
 *
 * Walking `examples/storybook-demo` that way discovered 52 files, of
 * which 32 -- 6.8 MB -- were its own Storybook build. The candidate set
 * therefore contained whatever tokens minified React and axe-core happen
 * to contain, and changed depending on whether the project had been built,
 * which is how `.accent-height` and `.fill-opacity` reached a stylesheet
 * whose sources never mention them.
 *
 * Anchoring at the repository root reads the whole inherited chain, which
 * is what `git check-ignore` answers with and what the project already
 * believes about its own files. Adding the missing names to
 * `DEFAULT_EXCLUDE` would have fixed this one project and left the next
 * build directory to be found the same way.
 */
function notIgnoredAbove(root: string): (file: string) => boolean {
  const gitRoot = gitRootAbove(root)
  // Nothing above to inherit from, or the walk already read it in place.
  if (gitRoot === undefined || gitRoot === path.resolve(root)) return () => true
  const ignored = inheritedGitIgnoredSync(gitRoot, root)
  return (file) => !ignored(file)
}

/**
 * Returns authored source files in stable order. The walk (`./walk.ts`)
 * supplies gitignore semantics and avoids following directory symlinks, preventing pnpm links
 * and temporary checkouts from expanding one project walk into another.
 *
 * An `include` the project supplied wins over gitignore, which the default
 * walk still respects. Not every file worth scanning is a file worth
 * committing: a design-token pipeline writes real `stylex.create` calls
 * and real class names into a directory the repository deliberately does
 * not track, and until now nothing could reach them -- `include` named
 * them and gitignore dropped them again, leaving the option with no
 * effect and no error.
 *
 * Tailwind draws the same line and it is worth matching rather than
 * inventing: its auto-detected walk skips gitignored paths, and a path
 * named by `@source` is scanned anyway. Checked against
 * `@tailwindcss/oxide` on a tree with `generated/` ignored -- the default
 * walk found `p-4`, adding `@source "generated/**"` found `gap-7` too.
 *
 * `exclude` and `DEFAULT_EXCLUDE` still apply, so `node_modules`, `dist`
 * and the rest stay out however broad the `include`.
 */
export function discoverSources(root: string, options: ContentOptions = {}): string[] {
  return discoverSourcePlan(root, options).files
}

function discoverSourcePlan(
  root: string,
  options: ContentOptions,
  manifestInstances?: ReadonlySet<string>,
) {
  // `include` is the project saying which files these are, so gitignore --
  // which answers a different question, about what to commit -- does not
  // get to overrule it.
  const respectGitignore = (options.respectGitignore ?? true) && options.include === undefined
  const files = walkFiles(options.include ?? DEFAULT_INCLUDE, {
    cwd: root,
    gitignore: respectGitignore,
    ignore: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])],
  })
    .filter((file) => SCANNABLE.has(path.extname(file)))
    .map((file) => path.resolve(file))

  const own = respectGitignore ? files.filter(notIgnoredAbove(root)) : files
  const replaced = new Set<string>()
  const all = [...own, ...packageSources(root, options, manifestInstances, replaced)].sort()
  let candidateFiles = all
  if (replaced.size) {
    const authored = new Set(own)
    candidateFiles = all.filter((file) => !replaced.has(file) || authored.has(file))
  }
  return {
    files: all,
    // Authored content always wins, even if a caller explicitly names its own
    // package as a dependency source. No path/name heuristic may erase it.
    candidateFiles,
  }
}

/**
 * The source of the installed packages that ship some.
 *
 * A library whose whole point is to be compiled by the consumer's build --
 * `@hozo/ui` is the first -- contributed nothing before this, because both
 * routes into the candidate set reject `node_modules` outright and
 * `DEFAULT_EXCLUDE` wins however broad an `include` is. Its components
 * rendered with class names that had no rules behind them, and #649 has the
 * measurement.
 *
 * It is the wall Tailwind hit and answered with `@source`, which can name a
 * path inside `node_modules`. `discoverSources` above already cites `@source`
 * as the precedent it matches for gitignore; this is the rest of it.
 *
 * Only the packages `content.packages` names. Until #2047 it defaulted to
 * every `@hozo/` dependency. Now a package with a manifest contributes its
 * candidates from that manifest, captured at startup (decision 012 point 4).
 * Measured against the walk on `native-showcase` and `apps/landing`, the
 * walk's extra candidates were all strings that are not class names: 12 on
 * Native and 31 on the Web. They were event names, type unions, style
 * values, `@hozo/metro`'s test fixtures and `@hozo/tailwind`'s sample-order
 * list.
 */
function packageSources(
  root: string,
  options: ContentOptions,
  manifestInstances: ReadonlySet<string> | undefined,
  replaced: Set<string>,
): string[] {
  const names = options.packages ?? []
  const files: string[] = []
  for (const name of names) {
    const dir = packageDirectory(name, root)
    if (dir === undefined) continue
    const instance = manifestInstances?.size ? realpathSync(dir) : undefined
    const covered = instance !== undefined && manifestInstances!.has(instance)
    // Rooted at the package, so `DEFAULT_EXCLUDE`'s `node_modules` rule means
    // "not a package nested inside this one" rather than "not this package".
    for (const file of walkFiles(DEFAULT_INCLUDE, {
      cwd: dir,
      gitignore: false,
      // Workspace checkouts contain fixtures omitted from Hozo's published
      // packages. Scanning them leaks test-only strings into production CSS
      // (for example Core's accessibility test contributes `inline`). Keep
      // this restriction at the dependency boundary: the app's own explicit
      // source walk is unchanged.
      ignore: [...DEFAULT_EXCLUDE, '**/*.{test,spec,bench}.{ts,tsx,js,jsx,mts,mjs}'],
    })) {
      if (SCANNABLE.has(path.extname(file))) {
        const absolute = path.resolve(file)
        files.push(absolute)
        if (covered) {
          // Only the actual canonical instance is covered, never a package
          // with the same name or a symlinked file escaping that instance.
          const relative = path.relative(instance, realpathSync(file))
          if (
            relative !== '..' &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
          )
            replaced.add(absolute)
        }
      }
    }
  }
  return files
}

/**
 * The source files the captured carriers ship for this build to compile
 * (`compiledByConsumer`), without their tests.
 *
 * Their candidates come from their manifests. The files themselves are still
 * read at startup, for Vite's Tailwind ordering seed only, because the build
 * compiles them anyway. Leaving that seed to fill in as transforms run made
 * `apps/landing`'s output vary from run to run (#2047).
 */
export function carrierSourceFiles(closure: CarrierClosure): string[] {
  if (closure.contributions.status !== 'complete') return []
  const files: string[] = []
  for (const row of closure.contributions.instances) {
    if (!row.data.compiledByConsumer) continue
    for (const file of walkFiles(DEFAULT_INCLUDE, {
      cwd: row.instance,
      gitignore: false,
      ignore: [...DEFAULT_EXCLUDE, '**/*.{test,spec,bench}.{ts,tsx,js,jsx,mts,mjs}'],
    }))
      if (SCANNABLE.has(path.extname(file))) files.push(path.resolve(row.instance, file))
  }
  return files.sort()
}

/**
 * Where a package's own files are, or `undefined` if it is not installed.
 *
 * Through its `package.json` rather than its entry point, because the entry
 * is often `dist/index.js` and the source beside it is what has the classes
 * in it. A package that ships no source contributes nothing and costs one
 * resolve.
 */
function packageDirectory(name: string, root: string): string | undefined {
  try {
    const require = createRequire(path.join(root, 'package.json'))
    return path.dirname(require.resolve(`${name}/package.json`))
  } catch {
    return undefined
  }
}

/**
 * The real file behind a bundler module id, if Hozo should inspect it.
 *
 * `node_modules` is out, except for a file the project walk has already
 * decided to read -- which is how a package named by `content.packages` gets
 * through here as well as through the walk. Without `admitted` the two
 * disagree: `discoverSources` would list the file and this would reject its
 * id, so it would be scanned on a cold build and never again on a change to
 * it, which is the shape of bug that only appears in a dev server.
 *
 * The predicate rather than a second look at the options, because the answer
 * is already computed: the integration holds the walk's result and can say
 * whether this exact path is in it.
 */
export function scannableFile(
  id: string,
  admitted?: (file: string) => boolean,
): string | undefined {
  if (id.startsWith('\0')) return undefined
  // `split` always yields a first element; the fallback is for the type.
  const file = id.split('?')[0] ?? id
  if (!TRANSFORMABLE.has(path.extname(file))) return undefined
  if (!id.includes('node_modules')) return file
  return admitted?.(path.resolve(file)) === true ? file : undefined
}

/** Whether this file only becomes readable after another plugin transforms it. */
export function isTransformedSource(file: string): boolean {
  return path.extname(file) === '.mdx'
}

/** Actual integration gate, deliberately narrower than the source inventory. */
export function semanticModuleEligible(file: string, target: 'web' | 'native'): boolean {
  return file.endsWith('.tsx') || (target === 'web' && isTransformedSource(file))
}

/**
 * The transformed sources on disk, which `discoverSources` deliberately
 * omits.
 *
 * Not for scanning -- that is the whole reason they are omitted, since on
 * disk they are Markdown. This exists because Turbopack resolves a
 * module's imports against a view of the directory it took before the
 * loader ran, so `@hozo/next` has to create each companion stylesheet
 * empty up front, and it cannot create one for a file it never listed.
 */
export function discoverTransformedSources(root: string, options: ContentOptions = {}): string[] {
  return walkFiles(['**/*.mdx'], {
    cwd: root,
    gitignore: false,
    ignore: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])],
  })
    .map((file) => path.resolve(file))
    .filter(notIgnoredAbove(root))
    .sort()
}

/** Feed one bundler's authoritative resolver answers into the shared graph. */
export async function resolveStylexRequests(
  modules: StylexModuleCache,
  requests: readonly StylexResolutionRequest[],
  resolve: (specifier: string, importer: string) => Promise<string | undefined>,
): Promise<boolean> {
  const grouped = new Map<string, Set<string>>()
  for (const { importer, specifier } of requests) {
    const specifiers = grouped.get(importer) ?? new Set<string>()
    specifiers.add(specifier)
    grouped.set(importer, specifiers)
  }
  let changed = false
  for (const [importer, specifiers] of grouped) {
    const bindings: StylexExternalBinding[] = []
    await Promise.all(
      [...specifiers].map(async (specifier) => {
        const resolved = await resolve(specifier, importer)
        const file = resolved ? scannableFile(resolved) : undefined
        if (!file) return
        const moduleId = path.resolve(file)
        if (modules.get(moduleId)) bindings.push({ specifier, moduleId })
      }),
    )
    changed = modules.setResolvedBindings(importer, bindings) || changed
  }
  return changed
}

/**
 * Opens the persistent cache, scans changed sources, and removes entries for
 * files absent from this complete walk. Unchanged files are statted but never
 * read, which keeps warm starts proportional to directory traversal.
 */
export function scanProject(
  root: string,
  options: ContentOptions = {},
  sources?: readonly string[],
  manifestContributions?: OwnerPackageContributions,
): ProjectCache {
  const started = performance.now()
  // The current candidate-only schema has no independent usesTailwind bit.
  // Replace extraction only when recognized manifest candidates already keep
  // auto preflight true. Empty/unrecognized manifests retain the old probe,
  // so a package containing only static classes cannot silently lose its reset.
  const manifestUsesTailwind = manifestContributions
    ? withOwnerPackageCandidates(
        { cache: openCandidateCache(undefined, sources), files: [] },
        manifestContributions,
        sources,
      ).usesTailwind
    : false
  const manifestInstances =
    manifestUsesTailwind && manifestContributions?.status === 'complete'
      ? new Set(manifestContributions.instances.map((row) => row.instance))
      : undefined
  const dir = path.join(root, CACHE_DIR)
  mkdirSync(dir, { recursive: true })
  const cache = openCandidateCache(path.join(dir, 'candidates.json'), sources)
  const stylexModules = new StylexModuleCache(path.join(dir, 'stylex-modules.json'))
  const facts = new FileFactStore(path.join(dir, FILE_FACTS_FILE))
  const { files, candidateFiles } = discoverSourcePlan(root, options, manifestInstances)
  const candidateSet = candidateFiles === files ? undefined : new Set(candidateFiles)
  let scannedFiles = 0
  let skippedFiles = 0
  let sourceBytes = 0
  let changed = false

  for (const file of files) {
    const stat = statSync(file)
    const candidate = candidateSet === undefined || candidateSet.has(file)
    const candidateCurrent = !candidate || cache.isCurrent(file, stat.mtimeMs)
    const stylexCurrent = stylexModules.isCurrent(file, stat.mtimeMs)
    const factsCurrent = facts.isCurrent(file, stat.mtimeMs)
    if (candidateCurrent && stylexCurrent && factsCurrent) {
      skippedFiles++
      continue
    }
    // The one read of this file: every per-file fact comes from it (decision 014).
    const source = readFileSync(file, 'utf8')
    sourceBytes += Buffer.byteLength(source)
    scannedFiles++
    if (!candidateCurrent) changed = cache.scanFile(file, source, stat.mtimeMs) || changed
    if (!stylexCurrent) changed = stylexModules.scanFile(file, source, stat.mtimeMs) || changed
    if (!factsCurrent) facts.record(file, source, stat.mtimeMs)
  }

  const deletedFiles = cache.retainFiles(candidateFiles)
  const deletedStylexFiles = stylexModules.retainFiles(files)
  facts.retainFiles(files)
  changed = deletedFiles > 0 || deletedStylexFiles > 0 || changed
  cache.persist()
  stylexModules.persist()
  facts.persist()

  return {
    cache: manifestContributions
      ? withOwnerPackageCandidates({ cache, files: candidateFiles }, manifestContributions, sources)
      : cache,
    stylexModules,
    facts,
    dir,
    // Manifest revisions are external to the persistent authored cache. Do not
    // let its warm hit suppress publication of a fresh manifest-backed union.
    changed: changed || manifestContributions !== undefined,
    files,
    stats: {
      discoveredFiles: files.length,
      scannedFiles,
      skippedFiles,
      deletedFiles,
      sourceBytes,
      durationMs: performance.now() - started,
    },
  }
}

/**
 * What `debug` prints, in one wording.
 *
 * Three integrations had three near-identical template literals and a
 * fourth had none at all, so `debug` was a documented option that did
 * nothing under Metro -- the same "accepted, then dropped" shape the
 * Storybook preset had.
 */
export function scanSummary(stats: ScanStats): string {
  return (
    `[hozo] discovered ${stats.discoveredFiles} files; scanned ${stats.scannedFiles}, ` +
    `skipped ${stats.skippedFiles}, removed ${stats.deletedFiles} in ` +
    `${stats.durationMs.toFixed(1)}ms`
  )
}

/** Absolute path of the base-layer stylesheet, beside the candidate one. */
export function preflightCssPath(dir: string): string {
  return path.join(dir, 'preflight.css')
}

/**
 * What belongs in that file, given the option and what the project uses.
 *
 * Returns the empty string rather than declining to write, and the
 * integrations import it either way. A conditional import would be a
 * module that appears and disappears as the first Tailwind class is added
 * to a project or the last one removed -- and in dev that means a graph
 * edge the bundler has to be told about at exactly the moment the decision
 * flips. An always-present file whose bytes change travels the path
 * `candidates.css` already travels.
 *
 * `usesTailwind` is `CandidateCache.usesTailwind`, and had to be: the
 * first version of this read the candidate stylesheet being non-empty,
 * which is a different question. Candidates are the classes the compiler
 * *couldn't* read, so a project whose Tailwind is all static
 * `className="p-4"` -- which is most projects -- reported none and would
 * have been refused the base layer it most needed.
 */
export function preflightCssFor(
  preflight: boolean | 'auto' | undefined,
  css: string,
  usesTailwind: boolean,
): string {
  return preflightEnabled(preflight, usesTailwind) ? css : ''
}

/** Font faces plus the optional reset, in the order Web needs them. */
export function webBaseCssFor(
  fontFaceCss: string | undefined,
  preflight: boolean | 'auto' | undefined,
  css: string,
  usesTailwind: boolean,
): string {
  const fonts = fontFaceCss?.trim()
  const base = preflightCssFor(preflight, css, usesTailwind).trim()
  const sections = [fonts, base].filter((section): section is string => Boolean(section))
  return sections.length === 0 ? '' : `${sections.join('\n\n')}\n`
}

/**
 * Whether this project ships a reset -- the option with `'auto'` resolved.
 *
 * Two things need the answer and they are on different platforms, which is
 * why it is a function rather than a line inside `preflightCssFor`. The
 * Web integrations need it to decide the bytes of `preflight.css`. The
 * Native compiler needs it because it has no user-agent stylesheet at all
 * and supplies defaults chosen against a browser -- and *which* browser
 * rendering it should match is exactly this question. A reset `h1` is
 * 16px/400 and an `hr` is 1px; the unreset ones are 32px/700 and 2px
 * (#315, measured in headless Chrome).
 *
 * Resolve it once per build and hold it. Under `'auto'` the answer comes
 * from `CandidateCache.usesTailwind`, which is monotonic during a build --
 * false until the first Tailwind class is seen -- so asking twice can give
 * two answers, and half a bundle compiled against each is a divergence no
 * test would report.
 */
export function preflightEnabled(
  preflight: boolean | 'auto' | undefined,
  usesTailwind: boolean,
): boolean {
  return preflight === undefined || preflight === 'auto' ? usesTailwind : preflight
}

/** Writes a generated artifact only when its bytes actually changed. */
export function writeFileIfChanged(file: string, content: string): boolean {
  try {
    if (readFileSync(file, 'utf8') === content) return false
  } catch {
    // A missing or briefly unreadable generated file should be replaced.
  }
  writeFileSync(file, content)
  return true
}

export function importSpecifier(fromFile: string, target: string): string {
  const relative = path.relative(path.dirname(fromFile), target).replaceAll('\\', '/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

const RESOLVABLE = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs']

/**
 * A resolver that needs no bundler: relative specifiers, and the project's
 * tsconfig `paths` (so `@/lib/utils` resolves as an Expo or Vite project
 * writes it). For the integration that has to decide before its bundler's
 * resolver can be asked: Metro, whose cache key is computed at startup.
 * A specifier it cannot resolve is a helper not found, which a declaration
 * can still supply.
 */
export function staticResolver(
  root: string,
): (specifier: string, importer: string) => string | undefined {
  let paths: Record<string, string[]> = {}
  try {
    const alias = readAnalysisAliases(root)
    if (alias.fact.status === 'resolved') paths = alias.fact.value.paths
  } catch {
    // An unreadable tsconfig leaves only relative specifiers.
  }
  const probe = (base: string) => {
    if (RESOLVABLE.includes(path.extname(base)) && existsSync(base)) return base
    for (const stem of [base, path.join(base, 'index')]) {
      for (const extension of RESOLVABLE) {
        if (existsSync(stem + extension)) return stem + extension
      }
    }
    return undefined
  }
  return (specifier, importer) => {
    if (specifier.startsWith('.')) return probe(path.resolve(path.dirname(importer), specifier))
    for (const [key, targets] of Object.entries(paths)) {
      const [prefix, suffix] = key.split('*')
      const matches =
        suffix === undefined
          ? key === specifier
          : specifier.startsWith(prefix ?? '') && specifier.endsWith(suffix)
      if (!matches) continue
      const capture =
        suffix === undefined
          ? ''
          : specifier.slice((prefix ?? '').length, specifier.length - suffix.length)
      for (const target of targets) {
        const found = probe(target.replace('*', capture))
        if (found) return found
      }
    }
    return undefined
  }
}

/**
 * Every class helper each file of the project calls, by absolute importer,
 * found with `staticResolver` (#964). Files that call none are left out.
 */
export function projectClassHelpers(
  root: string,
  files: readonly string[],
  /** The records `scanProject` produced; without them, each file is read here. */
  facts: FileFactStore = new FileFactStore(),
): Record<string, ClassHelper[]> {
  const resolve = staticResolver(root)
  const out: Record<string, ClassHelper[]> = {}
  for (const file of files) {
    const importer = path.resolve(file)
    const record = facts.get(importer)
    if (!record?.mentionsClassName) continue
    const found: ClassHelper[] = []
    for (const { specifier, imported } of record.helperImports) {
      if (specifier === TW_MERGE_MODULE && imported === 'twMerge') continue
      const target = resolve(specifier, importer)
      if (target && SCRIPT.test(target)) {
        const summary = facts.get(target)
        if (summary?.helperExports.includes(imported)) {
          const helper: ClassHelper = { module: specifier, name: imported }
          // Metro's startup scan has no resolved package edge for the merger.
          // Record the contract so a declaration cannot turn it into a joiner.
          if (summary.helperMerges.includes(imported)) helper.merge = true
          found.push(helper)
        }
      }
    }
    if (found.length > 0) out[importer] = found
  }
  return out
}

/**
 * The text forwarding of the project's own components, by absolute importer:
 * for each file, what every project module it imports hands a nested `Text`,
 * keyed by the specifier the file wrote (RFC 012 §7.1).
 *
 * A dependency's forwarding arrives in its manifest (#950). A project
 * component has none, because it is not a package: an `@hozo/ui` file copied
 * in by `hozo add`, or any component the project wrote. Each import is
 * resolved with `staticResolver`, as class helpers are, and the target is
 * summarised the way a manifest is built, following relative re-exports so an
 * `index.ts` barrel works. Specifiers that leave the project (a package, or a
 * path alias into `node_modules`) are a manifest's business and are skipped.
 * Files that import no forwarding component are left out.
 *
 * `sources` lists every file a summary that found something was read from,
 * barrels included: what has to change for the result to change, so
 * `hozo square` can say a running Metro holds an old one.
 */
export function projectTextForwarding(
  root: string,
  files: readonly string[],
  /** The records `scanProject` produced; without them, each file is read here. */
  facts: FileFactStore = new FileFactStore(),
): { importers: Record<string, TextForwardingModule[]>; sources: string[] } {
  const resolve = staticResolver(root)
  const summaries = new Map<string, TextForwardingModule['components']>()
  const sources = new Set<string>()
  const summarise = (target: string) => {
    let components = summaries.get(target)
    if (components === undefined) {
      const read: string[] = []
      try {
        components = textForwardingModule(
          '',
          buildManifest({
            entry: target,
            // A re-export of a directory probes its bare path first, which
            // has no record.
            summarize: (file) => {
              const record = facts.get(file)
              if (record) read.push(path.resolve(file))
              return record?.textForwarding
            },
          }),
        ).components
      } catch {
        components = []
      }
      if (components.length > 0) for (const file of read) sources.add(file)
      summaries.set(target, components)
    }
    return components
  }
  const outside = (file: string) => file.split(path.sep).includes('node_modules')
  const out: Record<string, TextForwardingModule[]> = {}
  for (const file of files) {
    const importer = path.resolve(file)
    // The scan's walk includes dependencies' sources; they are not callers
    // of project components.
    if (!SCRIPT.test(importer) || outside(importer)) continue
    const specifiers = facts.get(importer)?.imports
    if (!specifiers) continue
    const found: TextForwardingModule[] = []
    for (const specifier of specifiers) {
      const resolved = resolve(specifier, importer)
      const target = resolved && path.resolve(resolved)
      if (!target || !SCRIPT.test(target) || outside(target)) continue
      const components = summarise(target)
      if (components.length > 0) found.push({ module: specifier, components })
    }
    if (found.length > 0) out[importer] = found
  }
  return { importers: out, sources: [...sources].sort() }
}

/**
 * The classes this file hands to the run-time resolver that the resolver's
 * map does not hold (#2048).
 *
 * A class the compiler could not read is looked up at run time in the
 * project-wide candidate map, which the startup scan built. A file the scan
 * did not cover -- outside `content`, or edited since -- can carry a class
 * that is not in it, and then that class simply does not apply. This scans
 * the file the way the startup scan would and reports what it would have
 * added.
 *
 * The scan collects anything shaped like a class, including a string such
 * as `markPressed('rounded-rect')`. So a name absent from the map is
 * reported only when it is written inside a string -- a variable named
 * `ring` is not a class -- and compiles to a style with this project's
 * theme, which is what the map would have held for it. Absent names are
 * rare, so the compile is paid almost never.
 *
 * `known` is every name the map holds, including those it refuses on this
 * platform, which already warn at run time. It is not the ordering seed.
 */
export function classesMissingFromRuntimeMap(
  source: string,
  file: string,
  known: ReadonlySet<string>,
  compiler: Pick<Compiler, 'compileNative'>,
  sources?: readonly string[],
  markers?: readonly string[],
): CompileDiagnostic[] {
  const cache = openCandidateCache(undefined, sources ? [...sources] : undefined)
  cache.scanFile(file, source, 0)
  const absent = cache
    .candidates()
    .filter((name) => !known.has(name) && !isMarkerClass(name, markers))
  if (absent.length === 0) return []
  const strings = stringSpans(source)
  const missing = absent
    .map((name) => [name, firstOccurrence(source, name, strings)] as const)
    .filter(([name, at]) => at >= 0 && compilesToStyle(name, compiler))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return missing.map(([name, at]) => {
    const line = at < 0 ? 0 : source.slice(0, at).split('\n').length
    return {
      code: 'CLASS_NOT_IN_RUNTIME_MAP',
      severity: 'warning',
      message:
        `\`${name}\` (${path.basename(file)}${line ? `:${line}` : ''}) is resolved at run time, ` +
        "and the project's candidate map does not have it, so it will not apply. Include this " +
        "file in the project's `content`, or restart the bundler if it was edited after startup. " +
        'If it is not used as a class, list it in `markerClasses`.',
      spanStart: Math.max(at, 0),
      spanEnd: Math.max(at, 0) + (at < 0 ? 0 : name.length),
    }
  })
}

/** Whether `name`, written as a static class, gives an element any style. */
function compilesToStyle(name: string, compiler: Pick<Compiler, 'compileNative'>): boolean {
  if (!/^[\w:./[\]()#%!-]+$/.test(name)) return false
  const [component] = compiler.compileNative(
    `import {View} from '@hozo/core';const el=<View className="${name}"/>`,
  )
  // A property with a value, not just the empty entry an unknown name gets.
  return /[A-Za-z]+:\s*[^\s{]/.test(component?.styles ?? '')
}

/** Where `name` is first written as a whole class token inside a string, or -1. */
function firstOccurrence(
  source: string,
  name: string,
  strings: readonly (readonly [number, number])[],
): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const match of source.matchAll(new RegExp(`(?<![\\w:-])${escaped}(?![\\w-])`, 'g'))) {
    const at = match.index
    if (strings.some(([start, end]) => at >= start && at + name.length <= end)) return at
  }
  return -1
}

/**
 * The spans of string literals and template text in `source`, skipping
 * comments. A lexer's approximation: a regular expression literal holding a
 * quote can misplace the spans after it, which costs at worst a missed or
 * misplaced report, not a crash.
 */
function stringSpans(source: string): [number, number][] {
  const spans: [number, number][] = []
  // The brace depth at which each open template's `${` began.
  const templates: number[] = []
  let depth = 0
  let i = 0
  const quoted = (quote: string) => {
    const start = ++i
    while (i < source.length && source[i] !== quote && source[i] !== '\n')
      i += source[i] === '\\' ? 2 : 1
    spans.push([start, i])
    i++
  }
  // Template text from `i` up to its closing backtick or next `${`.
  const template = () => {
    const start = i
    while (i < source.length && source[i] !== '`') {
      if (source[i] === '\\') i += 2
      else if (source[i] === '$' && source[i + 1] === '{') {
        spans.push([start, i])
        templates.push(depth)
        depth++
        i += 2
        return
      } else i++
    }
    spans.push([start, i])
    i++
  }
  while (i < source.length) {
    const char = source[i]
    if (char === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      i = end < 0 ? source.length : end
    } else if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end < 0 ? source.length : end + 2
    } else if (char === '"' || char === "'") quoted(char)
    else if (char === '`') {
      i++
      template()
    } else if (char === '{') {
      depth++
      i++
    } else if (char === '}') {
      depth--
      i++
      if (templates.at(-1) === depth) {
        templates.pop()
        template()
      }
    } else i++
  }
  return spans
}
