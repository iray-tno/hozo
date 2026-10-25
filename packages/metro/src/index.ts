// Metro's custom-transformer contract: a module whose `transform` export
// receives `{ src, filename, options, ... }` and returns whatever the
// wrapped/upstream transformer returns. We only rewrite `src` before
// handing off -- everything else (JSX-to-JS compilation, the rest of
// Babel's pipeline) stays the upstream transformer's job, same division
// of labor as @hozo/vite running `enforce: 'pre'` ahead of
// @vitejs/plugin-react.
//
// The full integration is covered by development and minified production
// Metro bundles; physical-device validation remains separate.

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { type Compiler, createCompiler, type FontAvailability, type Theme } from '@hozo/compiler'
import { dependencyTextForwarding } from '@hozo/compiler/manifest'
import {
  CACHE_DIR,
  importSpecifier,
  resolveClassHelpers,
  StylexModuleCache,
  TailwindPreparationCancelled,
} from '@hozo/compiler/project'
import { DEFAULT_PRIMITIVE_SOURCES } from '@hozo/compiler/sources'
import { loadProjectTheme } from '@hozo/tailwind'
import { type HozoMetroState, readMetroState } from './config.ts'
import { modularizeHozoImports } from './modular-imports.ts'
import { MetroTailwindWorker, readTailwindTransfer } from './tailwind-worker.ts'
import { transformHozoSource } from './transform.ts'

const require = createRequire(import.meta.url)

interface TransformParams {
  src: string
  filename: string
  /// Metro's transform options. `projectRoot` is what locates the
  /// generated candidate module -- this transformer runs in a `jest-worker`
  /// subprocess, so it shares nothing else with the config that wrote it.
  options: { projectRoot?: string; platform?: string } & Record<string, unknown>
  [key: string]: unknown
}

interface UpstreamTransformer {
  transform(params: TransformParams): unknown
  getCacheKey?(options: CacheKeyOptions): string
}

interface CacheKeyOptions {
  projectRoot?: string
  [key: string]: unknown
}

let upstream: UpstreamTransformer | undefined

/** Adds the generated stylesheet only to Metro's Web graph. */
export function withWebFontFaces(
  source: string,
  filename: string,
  platform: string,
  fontFaceCssPath: string | undefined,
): string {
  if (platform !== 'web' || fontFaceCssPath === undefined) return source
  return `import ${JSON.stringify(importSpecifier(filename, fontFaceCssPath))}\n${source}`
}

/// The transformer this one wraps, in the order a project is likely to
/// have it.
///
/// `metro-react-native-babel-transformer` was the only name here until
/// 2026-08-16, and React Native renamed it at 0.73 -- so on any currently
/// supported version this package required something that isn't installed,
/// and the bundle died inside React Native's own source with a syntax
/// error that named neither. Found by building the example, which is the
/// only thing that runs this file at all.
///
/// `HOZO_UPSTREAM_TRANSFORMER` overrides the search, for projects (Expo
/// among them) that ship their own.
const UPSTREAM_CANDIDATES = [
  '@react-native/metro-babel-transformer',
  '@expo/metro-config/babel-transformer',
  'metro-react-native-babel-transformer',
]

function loadUpstream(projectRoot?: string): UpstreamTransformer {
  if (upstream) {
    return upstream
  }
  const configured =
    (projectRoot ? readMetroState(projectRoot)?.upstreamTransformer : undefined) ??
    process.env.HOZO_UPSTREAM_TRANSFORMER
  const candidates = configured ? [configured] : UPSTREAM_CANDIDATES
  // Resolved from the *project*, not from this package. The upstream
  // transformer is the consuming app's dependency, and under pnpm's strict
  // layout a package cannot see its consumer's -- so resolving relative to
  // this file finds nothing in exactly the setup a monorepo has.
  const fromProject = projectRoot ? createRequire(path.join(projectRoot, 'noop.js')) : require
  const tried: string[] = []
  for (const name of candidates) {
    for (const resolve of [fromProject, require]) {
      try {
        upstream = resolve(name) as UpstreamTransformer
        return upstream
      } catch {
        // Next resolver, then next candidate.
      }
    }
    tried.push(name)
  }
  throw new Error(
    `[hozo] no Babel transformer for Metro to hand off to. Hozo only rewrites the source and ` +
      `leaves the rest of the pipeline alone, so it needs the one your project already uses. ` +
      `Tried: ${tried.join(', ')}. Set HOZO_UPSTREAM_TRANSFORMER to the right one.`,
  )
}

/// One compiler per project, not per file.
///
/// Metro hands transformers one file at a time with no build-start hook to
/// hang project state on, so this is where "once" has to be arranged.
/// Configured projects now restore captured epochs below; this compiler
/// cache remains for callers without that context and legacy warned fallback.
///
/// Keyed by root, because a monorepo can transform files from more than one.
interface CompilerState {
  compiler: Compiler
  stylexModules?: StylexModuleCache
  worker?: MetroTailwindWorker
}

/**
 * The project's tokens plus the one build decision the Native backend
 * reads: whether the Web half of this project ships a CSS reset.
 *
 * Resolved in withHozo and carried through metro.json, because 'auto' is
 * answered by the project scan and the scan happens there -- once, in the
 * config process the workers cannot see. A theme is built even when the
 * project has none, because passing undefined here would quietly mean
 * "no reset" for a project that has one (#315).
 */
function themeWithPreflight(theme: Theme | undefined, preflight: boolean): Theme | undefined {
  if (!preflight) return theme
  return { ...(theme ?? { colors: [] }), preflight }
}

const compilers = new Map<string, CompilerState>()
function compilerFor(
  projectRoot: string | undefined,
  theme: Theme | undefined,
  sources: readonly string[],
  fontAvailability: FontAvailability | undefined,
): CompilerState {
  // A compiler is given its theme once, so a project whose resolved
  // preflight differs needs a compiler of its own: the key has to say so.
  const key = `${projectRoot ?? ''}\u0000${sources.join(',')}:${theme?.preflight ?? false}:${JSON.stringify(fontAvailability)}`
  let state = compilers.get(key)
  if (!state) {
    state = createCompilerState(projectRoot, theme, sources, fontAvailability)
    compilers.set(key, state)
  }
  return state
}

function createCompilerState(
  projectRoot: string | undefined,
  theme: Theme | undefined,
  sources: readonly string[],
  fontAvailability: FontAvailability | undefined,
): CompilerState {
  const compiler = createCompiler(theme, sources, fontAvailability)
  const stylexModules = projectRoot
    ? new StylexModuleCache(path.join(projectRoot, CACHE_DIR, 'stylex-modules.json'))
    : undefined
  if (stylexModules) compiler.setStylexModules(stylexModules.moduleSources())
  if (projectRoot) compiler.setTextForwarding(dependencyTextForwarding(projectRoot).modules)
  return { compiler, stylexModules }
}

// Bounded to one active epoch per root/platform, including in-flight loads.
// Metro's startup cache key fixes this graph until a server restart. Re-running
// withHozo in an embedding/test still retires late work instead of delivering it.
type WorkerEpoch = {
  key: string
  closed: boolean
  value?: CompilerState
  work: Promise<CompilerState>
}
const workerEpochs = new Map<string, WorkerEpoch>()
function workerKey(state: HozoMetroState, platform?: string): string {
  return JSON.stringify([
    state.epoch ?? [state.tailwind, state.preflight, state.sources, state.fontAvailability],
    platform === undefined ? undefined : state.stylexRevisions?.[platform],
  ])
}

function preparedCompilerFor(root: string, platform: string, state: HozoMetroState) {
  const slot = `${root}\u0000${platform}`
  const key = workerKey(state, platform)
  const existing = workerEpochs.get(slot)
  if (existing?.key === key && !existing.closed) return existing.work
  if (existing) {
    existing.closed = true
    existing.value?.worker?.invalidate()
  }
  const entry: WorkerEpoch = {
    key,
    closed: false,
    work: Promise.resolve().then(async () => {
      const transfer = await readTailwindTransfer(state.tailwind!)
      if (entry.closed) throw new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED')
      const value = createCompilerState(
        root,
        themeWithPreflight(transfer.snapshot.theme, state.preflight ?? false),
        state.sources ?? DEFAULT_PRIMITIVE_SOURCES,
        state.fontAvailability,
      )
      value.worker = new MetroTailwindWorker(value.compiler, transfer)
      entry.value = value
      return value
    }),
  }
  workerEpochs.set(slot, entry)
  // A failed read is not permanently memoized; report the error to this call.
  void entry.work.catch(() => {
    if (workerEpochs.get(slot) === entry) workerEpochs.delete(slot)
  })
  return entry.work
}

// Async because the theme comes from Tailwind's own resolver, which is
// async. Metro allows it, and the alternative -- compiling against the
// default palette while the project defines its own -- is the failure this
// exists to prevent.
/**
 * Metro folds this into every transform's cache key.
 *
 * A transform's output depends on things Metro cannot see: the upstream
 * transformer's own key, which it would have used without Hozo in front,
 * and the manifests of the project's dependencies, which decide what a
 * component from one of them hands a nested Text (#950). Metro has no way
 * to re-transform a file when something it read from elsewhere changes, so
 * a changed manifest has to change the key. Computed when Metro starts, so
 * upgrading a package takes a restart, as it does for Metro's own caches.
 * The captured CSS graph, full lexical ordering seed, preflight, trusted
 * sources and font facts are included too, not just the entry CSS filename.
 */
export function getCacheKey(options: CacheKeyOptions = {}): string {
  let upstreamKey = ''
  try {
    upstreamKey = loadUpstream(options.projectRoot).getCacheKey?.(options) ?? ''
  } catch {
    // `transform` reports a missing upstream, with what was tried.
  }
  const manifests = options.projectRoot ? dependencyTextForwarding(options.projectRoot).key : ''
  // The class helpers, declared and found when `withHozo` ran (#964): a
  // file's output depends on them, and nothing else tells Metro it does.
  const state = options.projectRoot ? readMetroState(options.projectRoot) : undefined
  const helpers = createHash('sha256')
    .update(JSON.stringify([state?.classHelpers ?? [], state?.foundClassHelpers ?? {}]))
    .digest('hex')
  return [upstreamKey, manifests, helpers, state ? workerKey(state) : ''].join('$')
}

export async function transform(params: TransformParams): Promise<unknown> {
  const projectRoot = params.options?.projectRoot
  const state = projectRoot ? readMetroState(projectRoot) : undefined
  const theme =
    projectRoot && !state?.tailwind
      ? await loadProjectTheme(projectRoot, {
          css: state?.css,
          warn: (message) => console.warn(message),
        })
      : undefined
  const platform = params.options?.platform ?? 'default'
  const compilerState =
    projectRoot && state?.tailwind
      ? await preparedCompilerFor(projectRoot, platform, state)
      : compilerFor(
          projectRoot,
          themeWithPreflight(theme, state?.preflight ?? false),
          state?.sources ?? DEFAULT_PRIMITIVE_SOURCES,
          state?.fontAvailability,
        )
  if (
    compilerState.stylexModules?.replaceResolvedBindings(state?.stylexBindings?.[platform] ?? [])
  ) {
    compilerState.compiler.setStylexModules(compilerState.stylexModules.moduleSources())
  }
  // This file's class helpers, declared and found (#964). Set immediately
  // before compiling, with no await in between: the compiler is shared.
  const absoluteFile = projectRoot ? path.resolve(projectRoot, params.filename) : params.filename
  compilerState.compiler.setClassHelpers(
    resolveClassHelpers(state?.classHelpers, state?.foundClassHelpers?.[absoluteFile]),
  )
  const rewritten = compilerState.worker
    ? await compilerState.worker.transform(
        params.src,
        params.filename,
        projectRoot!,
        compilerState.stylexModules,
      )
    : transformHozoSource(
        params.src,
        params.filename,
        projectRoot,
        compilerState.compiler,
        compilerState.stylexModules,
      )
  if (
    rewritten !== null &&
    compilerState.worker &&
    workerKey(readMetroState(projectRoot!) ?? {}, platform) !== workerKey(state!, platform)
  ) {
    compilerState.worker.invalidate()
    const slot = `${projectRoot}\u0000${platform}`
    const pending = workerEpochs.get(slot)
    if (pending?.key === workerKey(state!, platform)) {
      pending.closed = true
      workerEpochs.delete(slot)
    }
    throw new TailwindPreparationCancelled('TAILWIND_PROJECT_INVALIDATED')
  }
  const withFonts =
    rewritten === null
      ? null
      : withWebFontFaces(rewritten, params.filename, platform, state?.fontFaceCssPath)
  // After everything else, so it sees the imports the compiler left standing
  // as well as files it did not touch at all (`modular-imports.ts`).
  const before = withFonts ?? params.src
  const absolute = absoluteFile
  const modular = modularizeHozoImports(before, absolute)
  const nextParams = modular === params.src ? params : { ...params, src: modular }
  return loadUpstream(projectRoot).transform(nextParams)
}

export { type HozoMetroOptions, withHozo } from './config.ts'
export { MODULAR_SOURCES, modularizeHozoImports } from './modular-imports.ts'
export { candidateModulePath, generateCandidateModule } from './project.ts'
export { transformHozoSource } from './transform.ts'
