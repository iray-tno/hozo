import { performance } from 'node:perf_hooks'
import type { ProjectFact } from './analysis.ts'
import { readAnalysisFonts } from './analysis-fonts.ts'
import { prepareAnalysisStylex } from './analysis-stylex.ts'
import type { FontAvailability } from './font-diagnostics.ts'
import { createCompiler, openCandidateCache, type Theme } from './index.ts'
import { preflightEnabled } from './project.ts'
import { DEFAULT_PRIMITIVE_SOURCES } from './sources.ts'

export interface AnalysisThemeInput {
  css: Exclude<ProjectFact<string>, { status: 'defaulted' }>
  theme: Exclude<ProjectFact<Theme>, { status: 'defaulted' }>
  stylesheets: { file: string; sha256: string }[]
}

export interface AnalysisProjectOptions {
  root: string
  /** Authored scope is supplied by the caller, never a persistent project scan. */
  authoredSources: readonly { file: string; source: string }[]
  contextCandidates?: readonly string[]
  css?: string
  preflight?: boolean | 'auto'
  /** Explicit additions, not a replacement for the canonical default sources. */
  primitiveSources?: readonly string[]
  /** Explicit serializable createFontAvailability facts; never discover/execute loaders. */
  fontAvailability?: FontAvailability
  fontAvailabilityFile?: string
}

export interface AnalysisProjectFacts {
  css: ProjectFact<string>
  theme: ProjectFact<'builtin' | { colors: number; animations: number; spacingPx?: number }>
  preflight: ProjectFact<boolean>
  fonts: ProjectFact<FontAvailability>
  aliases: ProjectFact<unknown>
  stylexGraph: ProjectFact<unknown>
}

/**
 * Prepare once; consumers only aggregate subsequent analyzeModule results.
 * Inject the shared static theme service rather than making compiler and
 * Tailwind depend on each other. No app configuration is loaded here.
 * A future worker can recreate its own NAPI compiler from compilerInputs;
 * sharing this mutable compiler across workers is not promised safe.
 */
export async function prepareAnalysisProject(
  options: AnalysisProjectOptions,
  loadTheme: (root: string, css?: string) => Promise<AnalysisThemeInput>,
) {
  const started = performance.now()
  const fonts = readAnalysisFonts(options.root, options)
  const loaded = await loadTheme(options.root, options.css)
  const primitiveSources = [
    ...new Set([...DEFAULT_PRIMITIVE_SOURCES, ...(options.primitiveSources ?? [])]),
  ]
  const candidates = openCandidateCache(undefined, primitiveSources)
  for (const { file, source } of options.authoredSources) candidates.scanFile(file, source, 0)
  const preflight = preflightEnabled(options.preflight, candidates.usesTailwind)
  const theme = loaded.theme.status === 'resolved' ? loaded.theme.value : undefined
  const projectFacts: AnalysisProjectFacts = {
    css: loaded.css,
    theme:
      loaded.theme.status === 'absent'
        ? { status: 'defaulted' as const, value: 'builtin', reason: loaded.theme.reason }
        : loaded.theme.status === 'resolved'
          ? {
              status: 'resolved' as const,
              value: {
                colors: theme!.colors.length,
                animations: theme!.animations?.length ?? 0,
                spacingPx: theme!.spacingPx,
              },
              origin: loaded.theme.origin,
            }
          : loaded.theme,
    preflight:
      options.preflight === undefined
        ? {
            status: 'defaulted' as const,
            value: preflight,
            reason:
              'auto, evaluated using compiler candidate facts in the selected authored scope.',
          }
        : { status: 'resolved' as const, value: preflight, origin: 'explicit' as const },
    fonts: fonts.fact,
    aliases: {
      status: 'unresolved' as const,
      reason: 'Project import aliases are not assessed yet.',
    },
    stylexGraph: {
      status: 'unresolved' as const,
      reason: 'Cross-file StyleX context is not assessed yet.',
    },
  }
  const compilerInputs = {
    theme: { colors: [], ...theme, preflight },
    sources: primitiveSources,
    fontAvailability: fonts.fact.status === 'resolved' ? fonts.fact.value : undefined,
  }
  const stylex = prepareAnalysisStylex(
    options.root,
    options.authoredSources,
    options.contextCandidates ?? options.authoredSources.map(({ file }) => file),
  )
  projectFacts.aliases = stylex.aliases
  projectFacts.stylexGraph = {
    status: 'resolved',
    origin: 'discovered',
    value: {
      scope: 'static-admitted-modules',
      platforms: ['web', 'ios', 'android'],
      modules: Object.fromEntries(
        Object.entries(stylex.graphs).map(([platform, graph]) => [platform, graph.size]),
      ),
      unresolvedImports: stylex.resolutions.filter(({ status }) => status === 'unresolved').length,
    },
  }
  return {
    stylex,
    // Fonts are checked by analyzeModule against its actual selected Native
    // platform. The general createCompiler font hook checks both platforms.
    compiler: createCompiler(compilerInputs.theme, primitiveSources),
    compilerInputs,
    fontInputs: fonts.inputs,
    projectFacts,
    stylesheets: loaded.stylesheets,
    contextStatus:
      loaded.theme.status === 'resolved' || loaded.theme.status === 'absent'
        ? 'prepared'
        : 'partial',
    preflightBasis: {
      requested: options.preflight ?? 'auto',
      usesTailwind: candidates.usesTailwind,
      scope: 'selected-authored-files',
      scan: 'compiler-conservative-token-scan',
    },
    durationMs: performance.now() - started,
  }
}
