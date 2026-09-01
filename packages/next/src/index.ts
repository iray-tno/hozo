// Next.js integration.
//
// The first non-Vite bundler Hozo runs under, and the shape of the problem
// is genuinely different rather than differently spelled. A Vite plugin has
// lifecycle hooks -- `buildStart` to read the theme and walk the project,
// `watchChange` for deletions, `buildEnd` to persist. Next.js gives a
// config object and a loader, and under Turbopack there is no plugin API at
// all: a loader is the only place user code runs.
//
// So the project-wide half happens here, while `next.config.ts` is being
// evaluated. That is once per build, before anything is compiled, in the
// Next process itself -- which is exactly when a Vite plugin's `buildStart`
// would run. The per-file half is the loader, and it re-scans each module
// it is handed so a class written during `next dev` reaches the candidate
// stylesheet without a restart.

import { existsSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { cssFileNameFor } from '@hozo/compiler/lower'
import {
  discoverTransformedSources,
  type HozoProjectOptions,
  preflightCssFor,
  preflightCssPath,
  scanProject,
  scanSummary,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { preflightCss } from '@hozo/tailwind'

/**
 * The same options every Hozo integration takes, under this one's name.
 *
 * `root` defaults to the working directory, which is what Next.js sets it
 * to while it evaluates the config.
 */
export type HozoNextOptions = HozoProjectOptions

/** What the loader needs, resolved once so every worker gets the same answer. */
export interface HozoLoaderOptions extends HozoNextOptions {
  root: string
  candidateCssPath: string
  preflightPath: string
}

/**
 * A Next.js config with Hozo installed.
 *
 * Registers the same loader twice, because Next has two bundlers and no
 * shared way to reach both: `turbopack.rules` for the default one and
 * `webpack()` for `next build --webpack`. The loader itself is identical --
 * Turbopack implements the webpack loader interface Hozo needs -- so this
 * is registration, not two implementations.
 */
export function withHozo<T extends Record<string, unknown>>(
  nextConfig: T = {} as T,
  options: HozoNextOptions = {},
): T {
  const root = options.root ?? process.cwd()
  const loaderOptions = prepareProject(root, options)
  // Resolved to an absolute path rather than left as a bare specifier.
  // Turbopack resolves loader names against the *project* root, and in a
  // workspace this package is a symlink under a `node_modules/.pnpm` path
  // that a bare name doesn't reach.
  const loader = createRequire(import.meta.url).resolve('../loader.js')

  const tsxRule = {
    loaders: [{ loader, options: loaderOptions }],
    as: '*.tsx',
  }
  const tsRule = {
    loaders: [{ loader, options: loaderOptions }],
    as: '*.ts',
  }

  return {
    ...nextConfig,
    turbopack: {
      ...(nextConfig.turbopack as Record<string, unknown> | undefined),
      rules: {
        ...((nextConfig.turbopack as { rules?: Record<string, unknown> } | undefined)?.rules ?? {}),
        '*.tsx': tsxRule,
        // Definition-only StyleX modules must reach the loader during dev
        // so their registry entry changes before an importing component is
        // recompiled. `lowerModule` itself still leaves non-TSX untouched.
        '*.ts': tsRule,
      },
    },
    webpack(config: WebpackConfig, context: unknown) {
      config.module ??= { rules: [] }
      config.module.rules ??= []
      insertIntoMdxRule(config, { loader, options: loaderOptions }, root, options)
      // `enforce: 'pre'`, the same declaration the Vite plugin makes and
      // for the same reason: Hozo has to see the source as written. Array
      // position is not enough, and it reads backwards -- webpack runs a
      // module's loaders right-to-left, so an earlier rule runs *later*.
      // Without this the SWC transform got there first, Hozo was handed
      // compiled JavaScript, found no JSX to lower, and left the
      // `@hozo/core` import in place; the App Router then refused the build
      // because that module calls `useState` in a server component.
      config.module.rules.unshift({
        enforce: 'pre',
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{ loader, options: loaderOptions }],
      })
      const user = (nextConfig as { webpack?: (c: WebpackConfig, x: unknown) => WebpackConfig })
        .webpack
      return user ? user(config, context) : config
    },
  } as unknown as T
}

interface WebpackConfig {
  module?: { rules?: unknown[] }
}

interface UseEntry {
  loader?: string
  options?: unknown
}

interface MaybeMdxRule {
  use?: UseEntry[]
}

/**
 * Puts Hozo's loader between the MDX loader and the one that compiles its
 * JSX.
 *
 * Webpack runs a module's loaders right-to-left, and `@next/mdx` registers
 * `use: [defaultLoaders.babel, mdxLoader]` -- so MDX runs, then Next's own
 * transform. Hozo has to be in the middle of exactly that array. A rule of
 * its own cannot get there: two rules matching one module concatenate their
 * `use` lists, so whichever order they are in, Hozo lands either before the
 * MDX loader (and is handed Markdown) or after Next's (and is handed
 * JavaScript with no JSX left). Neither fails loudly -- the second leaves
 * the `@hozo/core` import in place, and the App Router then rejects the
 * page for calling `useState` in a server component, which names nothing
 * that is actually wrong.
 *
 * This works because `@next/mdx` pushes its rule and *then* calls the inner
 * config's `webpack()`, so by the time this runs the rule is there. It
 * follows that `withMDX(withHozo(config))` is the required nesting; the
 * other way round Hozo runs first and finds nothing, which is what the
 * warning is for. Turbopack needs none of this: its MDX rule declares
 * `as: '*.tsx'`, so the output re-enters the pipeline under a name Hozo's
 * own `*.tsx` rule already matches.
 */
function insertIntoMdxRule(
  config: WebpackConfig,
  entry: UseEntry,
  root: string,
  options: HozoNextOptions,
): void {
  const rules = (config.module?.rules ?? []) as MaybeMdxRule[]
  // `use` is a string, an object, an array, or a function depending on how
  // the rule was written, and Next's own rules are all four. Only an array
  // has a middle to insert into.
  const mdxRules = rules.filter(
    (rule) =>
      Array.isArray(rule?.use) &&
      rule.use.some((used) => typeof used?.loader === 'string' && MDX_LOADER.test(used.loader)),
  )
  for (const rule of mdxRules) {
    // Before the last entry, which is the MDX loader itself: right-to-left
    // makes that the first to run and this the second.
    rule.use?.splice(rule.use.length - 1, 0, entry)
  }
  if (mdxRules.length > 0 || discoverTransformedSources(root, options.content).length === 0) return
  console.warn(
    '[hozo] found .mdx files but no MDX loader to run after. Nest the plugins as ' +
      'withMDX(withHozo(config)) and pass options: { jsx: true } to @next/mdx, or those ' +
      'pages will ship uncompiled.',
  )
}

/** `@next/mdx` resolves both of its loaders from its own package directory. */
const MDX_LOADER = /[\\/]@next[\\/]mdx[\\/]|[\\/]@mdx-js[\\/]loader/

/**
 * Walks the project and writes the candidate stylesheet, returning what the
 * loader needs to keep it current.
 *
 * Synchronous and eager, unlike the Vite plugin's `buildStart`. There is
 * nowhere later to put it: Turbopack has no build-start hook, and a
 * stylesheet written after the first module was compiled would be a
 * stylesheet the first module didn't import.
 */
function prepareProject(root: string, options: HozoNextOptions): HozoLoaderOptions {
  const project = scanProject(root, options.content)
  const candidateCssPath = path.join(project.dir, 'candidates.css')
  const preflightPath = preflightCssPath(project.dir)
  // Rendered with no theme: the theme is loaded asynchronously and this
  // runs synchronously. The loader rewrites the file with the real theme
  // before any module that imports it is compiled, and an empty file here
  // is what makes the import resolve at all.
  // No order, for the same reason there is no theme here: both need the
  // project's design system, which cannot be built synchronously, and
  // this runs while `next.config.ts` is being evaluated. The loader
  // rewrites the file with both before any module that imports it is
  // compiled.
  writeFileIfChanged(candidateCssPath, project.cache.renderCss(undefined, undefined))
  // And the base layer beside it, on the same terms and for the same
  // reason: it has to be on disk before the first module imports it.
  // Empty when the project uses no Tailwind classes, so the import stays
  // one fixed edge in the graph rather than one that appears and
  // disappears -- see `preflightCssFor`.
  writeFileIfChanged(
    preflightPath,
    preflightCssFor(options.preflight, preflightCss(), project.cache.usesTailwind),
  )
  // And the same treatment for the per-module stylesheets, for the same
  // reason one layer down. The loader writes a module's CSS beside it and
  // imports it from the code it returns; Turbopack resolves that import
  // against a view of the directory it took before the loader ran, so on
  // a tree where the file does not already exist the build fails with
  // "Can't resolve ./page.tsx.hozo.css" -- for a file that is on disk by
  // the time anyone looks.
  //
  // It only ever worked because the file survived from a previous build.
  // Every local run had one; CI checks out a clean tree and was the first
  // thing to try this from nothing.
  //
  // Empty, and only for the extension Turbopack's rule matches. The
  // loader fills them in, and a module that lowers to no CSS is left with
  // an empty file nobody imports.
  for (const file of project.files) {
    if (!file.endsWith('.tsx')) continue
    const sidecar = path.join(path.dirname(file), cssFileNameFor(file))
    if (!existsSync(sidecar)) writeFileSync(sidecar, '')
  }
  // And for `.mdx`, which the project walk deliberately never lists --
  // see `TRANSFORMABLE`, and `discoverTransformedSources` for why they
  // still have to be found here.
  //
  // Two names each, because the loader is handed a different path by each
  // bundler. `@next/mdx`'s Turbopack rule declares `as: '*.tsx'`, so
  // Turbopack renames the module to `page.mdx.tsx` before Hozo's own
  // `*.tsx` rule picks it up -- which is also why MDX needs no rule of its
  // own here. Webpack renames nothing and the loader sees `page.mdx`.
  // An unused empty file is what every module that lowers to no CSS
  // already leaves behind.
  for (const file of discoverTransformedSources(root, options.content)) {
    for (const name of [cssFileNameFor(file), cssFileNameFor(`${file}.tsx`)]) {
      const sidecar = path.join(path.dirname(file), name)
      if (!existsSync(sidecar)) writeFileSync(sidecar, '')
    }
  }
  project.cache.persist()
  if (options.debug) {
    console.info(scanSummary(project.stats))
  }
  return { ...options, root, candidateCssPath, preflightPath }
}
