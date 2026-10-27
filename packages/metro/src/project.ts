// Metro's half of the candidate scan (proposal §7's third tier on Native).
//
// Why this is a separate config-time step, where Vite does it inside the
// plugin: Metro runs `transform` in `jest-worker` subprocesses. Several
// workers transform files concurrently, so scanning and writing from there
// would mean several writers to one cache file. Metro's *config* layer is
// ordinary main-process code, which is where this runs -- one writer, no
// locking needed, exactly the ownership the cache crate assumes.
//
// KNOWN LIMITATION: the candidate module is generated once, at config load.
// A class that only becomes a candidate after Metro started -- a new string
// literal in a helper module -- won't be in the map until Metro is
// restarted. `react-native-css` documents the same restriction for its own
// transformer. The generated module is deliberately written under
// `node_modules/.hozo/`, so a restart with a cleared cache regenerates it.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  prepareFinalTailwindContext,
  scanTailwindOrderCandidates,
  TAILWIND_SCALAR_ORDER_POLICY,
} from '@hozo/compiler'

import {
  type HozoProjectOptions,
  preflightEnabled,
  scanProject,
  scanSummary,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { loadProjectTailwindSnapshot, loadProjectTheme, type Theme } from '@hozo/tailwind'

/** Config owns these immutable bytes; workers read them once, not per file. */
export interface MetroTailwindReference {
  file: string
  sha256: string
}

/// File name of the generated resolver module. Also read by the
/// transformer, which imports it into every file it lowers.
export const CANDIDATE_MODULE = 'candidates.native.js'

/**
 * Absolute path of the generated resolver module for `projectRoot`.
 *
 * Derived rather than passed around because the transformer runs in a
 * separate process from the config that generated it -- the only thing
 * they reliably share is the project root, which Metro gives the
 * transformer in its options.
 */
export function candidateModulePath(projectRoot: string): string {
  return path.join(projectRoot, 'node_modules', '.hozo', CANDIDATE_MODULE)
}

/** What one project scan told the config layer. */
export interface GeneratedCandidateModule {
  /** Absolute path of the written module, mostly so a caller can log it. */
  modulePath: string
  /**
   * Whether the scan saw any Tailwind class at all.
   *
   * Reported from here because it is the same walk: `withHozo` needs it to
   * resolve `preflight: 'auto'`, and a second scan to ask one boolean
   * would be a second disk walk that could also disagree with this one.
   */
  usesTailwind: boolean
  /** The one resolved answer shared by the compiler and runtime fallbacks. */
  preflight: boolean
  /** The files the walk found, for anything else that needs the same list. */
  files: string[]
  tailwind?: MetroTailwindReference
}

/**
 * Scans the project and writes the candidate resolver module. Call from
 * `metro.config.js` before returning the config.
 *
 * Resolves against the project's theme. Async because reading the theme
 * means asking Tailwind, and Tailwind's design-system loader is async.
 * Metro config files can await, and the alternative -- resolving these
 * classes against the default palette while every other class in the app
 * uses the project's -- would be two different answers for the same
 * utility in one bundle.
 */
export async function generateCandidateModule(
  projectRoot: string,
  options: HozoProjectOptions = {},
): Promise<GeneratedCandidateModule> {
  let snapshot: Awaited<ReturnType<typeof loadProjectTailwindSnapshot>> | undefined
  let theme: Theme | undefined
  try {
    snapshot = await loadProjectTailwindSnapshot(projectRoot, { css: options.css })
    theme = snapshot.theme
  } catch (error) {
    // Preserve existing warned lowering for unassessed CSS, never label a
    // default-palette fallback as this project's canonical order context.
    console.warn(
      `[hozo] ordering snapshot unavailable; using existing lowering: ${(error as Error).message}`,
    )
    theme = await loadProjectTheme(projectRoot, {
      css: options.css,
      fresh: true,
      warn: (message) => console.warn(message),
    })
  }
  const { cache, stats, files } = scanProject(projectRoot, options.content, options.sources)
  if (options.debug) {
    // eslint-disable-next-line no-console
    console.info(scanSummary(stats))
  }
  const preflight = preflightEnabled(options.preflight, cache.usesTailwind)
  const modulePath = candidateModulePath(projectRoot)
  const resolvedTheme = { colors: [], ...theme, preflight }
  // Static workers and this complete runtime map share the same ordering
  // policy and captured CSS bytes, not numeric rank ordinals. Static seed
  // names must not be reintroduced as runtime candidates.
  const runtimeOrder = snapshot ? await snapshot.prepareOrder(cache.candidates()) : undefined
  writeFileIfChanged(
    modulePath,
    runtimeOrder
      ? cache.renderNativeModulePlan(
          prepareFinalTailwindContext(JSON.stringify(runtimeOrder.snapshot)),
          resolvedTheme,
        ).code
      : cache.renderNativeModule(resolvedTheme),
  )
  let tailwind: MetroTailwindReference | undefined
  if (snapshot) {
    // Runtime candidates deliberately subtract static classes. The ordering
    // seed must include them, without putting them back into runtime CSS.
    const names = new Set(cache.candidates())
    for (const file of files) {
      for (const name of scanTailwindOrderCandidates(readFileSync(file, 'utf8'))) names.add(name)
    }
    const content = JSON.stringify({
      schema: 1,
      orderingPolicy: TAILWIND_SCALAR_ORDER_POLICY,
      stylesheet: snapshot.serialize(),
      candidates: [...names].sort(),
    })
    const sha256 = createHash('sha256').update(content).digest('hex')
    const file = path.join(projectRoot, 'node_modules', '.hozo', `tailwind-${sha256}.json`)
    writeFileIfChanged(file, content)
    tailwind = { file, sha256 }
  }
  return { modulePath, usesTailwind: cache.usesTailwind, preflight, files, tailwind }
}
