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

import { createRequire } from 'node:module'
import path from 'node:path'
import { type Compiler, createCompiler, type FontAvailability, type Theme } from '@hozo/compiler'
import { CACHE_DIR, importSpecifier, StylexModuleCache } from '@hozo/compiler/project'
import { DEFAULT_PRIMITIVE_SOURCES } from '@hozo/compiler/sources'
import { loadProjectTheme } from '@hozo/tailwind'
import { readMetroState } from './config.ts'
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
/// `loadProjectTheme` already memoizes, so the theme itself was cheap after
/// the first file -- what was not is handing 288 colours to the addon
/// again for each one, which costs more than compiling a small file does.
///
/// Keyed by root, because a monorepo can transform files from more than one.
interface CompilerState {
  compiler: Compiler
  stylexModules?: StylexModuleCache
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
    const compiler = createCompiler(theme, sources, fontAvailability)
    const stylexModules = projectRoot
      ? new StylexModuleCache(path.join(projectRoot, CACHE_DIR, 'stylex-modules.json'))
      : undefined
    if (stylexModules) compiler.setStylexModules(stylexModules.moduleSources())
    state = { compiler, stylexModules }
    compilers.set(key, state)
  }
  return state
}

// Async because the theme comes from Tailwind's own resolver, which is
// async. Metro allows it, and the alternative -- compiling against the
// default palette while the project defines its own -- is the failure this
// exists to prevent.
export async function transform(params: TransformParams): Promise<unknown> {
  const projectRoot = params.options?.projectRoot
  const state = projectRoot ? readMetroState(projectRoot) : undefined
  const theme = projectRoot
    ? await loadProjectTheme(projectRoot, {
        css: state?.css,
        warn: (message) => console.warn(message),
      })
    : undefined
  const compilerState = compilerFor(
    projectRoot,
    themeWithPreflight(theme, state?.preflight ?? false),
    state?.sources ?? DEFAULT_PRIMITIVE_SOURCES,
    state?.fontAvailability,
  )
  const platform = params.options?.platform ?? 'default'
  if (
    compilerState.stylexModules?.replaceResolvedBindings(state?.stylexBindings?.[platform] ?? [])
  ) {
    compilerState.compiler.setStylexModules(compilerState.stylexModules.moduleSources())
  }
  const rewritten = transformHozoSource(
    params.src,
    params.filename,
    projectRoot,
    compilerState.compiler,
    compilerState.stylexModules,
  )
  const withFonts =
    rewritten === null
      ? null
      : withWebFontFaces(rewritten, params.filename, platform, state?.fontFaceCssPath)
  const nextParams = withFonts === null ? params : { ...params, src: withFonts }
  return loadUpstream(projectRoot).transform(nextParams)
}

export { type HozoMetroOptions, withHozo } from './config.ts'
export { candidateModulePath, generateCandidateModule } from './project.ts'
export { transformHozoSource } from './transform.ts'
