// Project-wide source discovery and candidate-cache reconciliation, shared
// by the Vite and Metro integrations.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { globbySync, isGitIgnoredSync } from 'globby'

import { openCandidateCache, type CandidateCache, type StylexExternalBinding } from './index.ts'
import {
  StylexModuleCache,
  type StylexResolutionRequest,
} from './stylex-project.ts'

export {
  StylexModuleCache,
  type CachedStylexModule,
  type StylexResolvedBindings,
  type StylexResolutionRequest,
} from './stylex-project.ts'

const SCANNABLE = new Set(['.tsx', '.jsx', '.ts', '.js', '.mts', '.mjs'])
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
}

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
   * `true` always emits it, `false` never. Native ignores this: React
   * Native has no cascade and no user-agent stylesheet, so there is
   * nothing to reset.
   */
  preflight?: boolean | 'auto'
  /** Report project-scan work and timing through the bundler's logger. */
  debug?: boolean
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
 * Globby's `gitignore` reads only the `.gitignore` files at or below the
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
  // Nothing above to inherit from, or globby already read it in place.
  if (gitRoot === undefined || gitRoot === path.resolve(root)) return () => true
  const ignored = isGitIgnoredSync({ cwd: gitRoot })
  return (file) => !ignored(file)
}

/**
 * Returns authored source files in stable order. Globby supplies gitignore
 * semantics and avoids following directory symlinks, preventing pnpm links
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
  // `include` is the project saying which files these are, so gitignore --
  // which answers a different question, about what to commit -- does not
  // get to overrule it.
  const respectGitignore = (options.respectGitignore ?? true) && options.include === undefined
  const files = globbySync(options.include ?? DEFAULT_INCLUDE, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    gitignore: respectGitignore,
    ignore: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])],
  })
    .filter((file) => SCANNABLE.has(path.extname(file)))
    .map((file) => path.resolve(file))

  return (respectGitignore ? files.filter(notIgnoredAbove(root)) : files).sort()
}

/** The real file behind a bundler module id, if Hozo should inspect it. */
export function scannableFile(id: string): string | undefined {
  if (id.startsWith('\0') || id.includes('node_modules')) return undefined
  //  always yields a first element; the fallback is for the type.
  // `split` always yields a first element; the fallback is for the type.
  const file = id.split('?')[0] ?? id ?? id
  return SCANNABLE.has(path.extname(file)) ? file : undefined
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
export function scanProject(root: string, options: ContentOptions = {}): ProjectCache {
  const started = performance.now()
  const dir = path.join(root, CACHE_DIR)
  mkdirSync(dir, { recursive: true })
  const cache = openCandidateCache(path.join(dir, 'candidates.json'))
  const stylexModules = new StylexModuleCache(path.join(dir, 'stylex-modules.json'))
  const files = discoverSources(root, options)
  let scannedFiles = 0
  let skippedFiles = 0
  let sourceBytes = 0
  let changed = false

  for (const file of files) {
    const stat = statSync(file)
    if (cache.isCurrent(file, stat.mtimeMs) && stylexModules.isCurrent(file, stat.mtimeMs)) {
      skippedFiles++
      continue
    }
    const source = readFileSync(file, 'utf8')
    sourceBytes += Buffer.byteLength(source)
    scannedFiles++
    changed = cache.scanFile(file, source, stat.mtimeMs) || changed
    changed = stylexModules.scanFile(file, source, stat.mtimeMs) || changed
  }

  const deletedFiles = cache.retainFiles(files)
  const deletedStylexFiles = stylexModules.retainFiles(files)
  changed = deletedFiles > 0 || deletedStylexFiles > 0 || changed
  cache.persist()
  stylexModules.persist()

  return {
    cache,
    stylexModules,
    dir,
    changed,
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
  const wanted = preflight === undefined || preflight === 'auto' ? usesTailwind : preflight
  return wanted ? css : ''
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
