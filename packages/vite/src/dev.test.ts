// The dev-server half of the plugin, which nothing had ever run.
//
// Every example verifies a *build*: one pass, one theme load, one project
// scan, exit. Dev is a different program -- it stays up, the project
// changes underneath it, and the parts that handle that (`watchChange`,
// the per-transform rescan, the candidate-stylesheet invalidation) had no
// coverage at all. Code that only ever type-checks is the failure mode
// this repository keeps finding.
//
// A real `createServer`, not a mock: what is under test is the plugin's
// agreement with Vite, and a mock would be a copy of my belief about it.

import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createServer, type PluginOption, type ViteDevServer } from 'vite'

import { type HozoOptions, hozo } from './index.ts'

const roots: string[] = []
const servers: ViteDevServer[] = []

after(async () => {
  for (const server of servers) await server.close()
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function project(files: Record<string, string>): string {
  // Canonicalised, because Vite resolves its root before comparing paths
  // against it and `tmpdir()` does not hand back a canonical path on
  // either CI platform. On macOS `/tmp` is a symlink to `/private/tmp`;
  // on Windows the runner's home is `runneradmin`, long enough that the
  // temp path comes back as the 8.3 short name `RUNNER~1`. Either way
  // every file in the project was "not in cwd".
  //
  // `.native` rather than `realpathSync`, and that is the whole fix on
  // Windows: the JavaScript implementation follows symlinks, which
  // settles macOS, and leaves a short name short. Only the OS call
  // expands it.
  //
  // Neither shape occurs on a developer's machine, which is why a runner
  // was the first thing to see this.
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'hozo-dev-')))
  roots.push(root)
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  return root
}

async function serve(
  root: string,
  options: HozoOptions = {},
  aliases: Record<string, string> = {},
  extraPlugins: PluginOption[] = [],
  beforePlugins: PluginOption[] = [],
) {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true, watch: null },
    // The temporary project has no node_modules of its own, so React's
    // JSX runtime is resolved from this repository's. Vite's own JSX
    // transform then runs exactly as it would in a real project -- which
    // matters, because it is what reads the output Hozo produced.
    resolve: {
      alias: {
        'react/jsx-dev-runtime': createRequire(import.meta.url).resolve('react/jsx-dev-runtime'),
        'react/jsx-runtime': createRequire(import.meta.url).resolve('react/jsx-runtime'),
        react: createRequire(import.meta.url).resolve('react'),
        ...aliases,
      },
    },
    plugins: [...beforePlugins, hozo(options), ...extraPlugins],
  })
  servers.push(server)
  return server
}

const candidates = (root: string) =>
  readFileSync(path.join(root, 'node_modules', '.hozo', 'candidates.css'), 'utf8')

const preflight = (root: string) =>
  readFileSync(path.join(root, 'node_modules', '.hozo', 'preflight.css'), 'utf8')

/**
 * A project with no Tailwind class anywhere, which is what a StyleX-only
 * codebase looks like to the scanner.
 *
 * Written without `stylex.create` only because `@stylexjs/stylex` is not
 * a dependency of this package and Vite resolves the import for real. What
 * is under test is the absence of candidates, and the two are identical
 * there.
 */
const NO_TAILWIND_APP = `import { View } from '@hozo/core'
export const App = () => <View style={{ padding: 16 }} />
`

const ACCENT = "export const accent = () => 'bg-emerald-500'\n"

const APP = `import { View } from '@hozo/core'
import { accent } from './accent.ts'
export const App = () => <View className={accent()}><View className="p-4" /></View>
`

test('the dev server lowers a module on request', async () => {
  const root = project({
    'App.tsx': APP,
    'accent.ts': "export const accent = () => 'bg-emerald-500'\n",
  })
  const server = await serve(root)

  const result = await server.transformRequest('/App.tsx')
  assert.ok(result, 'the module was not transformed')
  assert.match(result.code, /hozo-view/, 'the View did not lower')
  assert.match(result.code, /App\.tsx\.hozo\.css/, 'the companion stylesheet was not imported')

  const companion = readFileSync(path.join(root, 'App.tsx.hozo.css'), 'utf8')
  assert.match(companion, /padding-top: 16px/)
})

test('the dev server lowers a static StyleX sheet imported from another file', async () => {
  const root = project({
    'styles.ts': `import * as stylex from '@stylexjs/stylex'
      export const styles = stylex.create({ root: { padding: 16, backgroundColor: 'red' } })`,
    'index.ts': `export { styles as cardStyles } from './styles'`,
    'App.tsx': `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { cardStyles } from './index'
      export const App = () => <View {...stylex.props(cardStyles.root)} />`,
  })
  const server = await serve(root)

  const result = await server.transformRequest('/App.tsx')
  assert.ok(result)
  assert.doesNotMatch(result.code, /stylex\.props/)
  const companion = readFileSync(path.join(root, 'App.tsx.hozo.css'), 'utf8')
  assert.match(companion, /padding-top: 16px/)
  assert.match(companion, /background-color: red/)
})

test('the dev server uses Vite aliases for StyleX imports and re-exports', async () => {
  const root = project({
    'styles.ts': `import * as stylex from '@stylexjs/stylex'
      export const styles = stylex.create({ root: { padding: 20, color: 'purple' } })`,
    'index.ts': `export { styles as cardStyles } from '@theme/styles'`,
    'App.tsx': `import * as stylex from '@stylexjs/stylex'
      import { View } from '@hozo/core'
      import { cardStyles } from '@theme'
      export const App = () => <View {...stylex.props(cardStyles.root)} />`,
  })
  const server = await serve(
    root,
    {},
    {
      '@theme/styles': path.join(root, 'styles.ts'),
      '@theme': path.join(root, 'index.ts'),
    },
  )

  const result = await server.transformRequest('/App.tsx')
  assert.ok(result)
  assert.doesNotMatch(result.code, /stylex\.props/)
  const companion = readFileSync(path.join(root, 'App.tsx.hozo.css'), 'utf8')
  assert.match(companion, /padding-top: 20px/)
  assert.match(companion, /color: purple/)
})

test('a class only a helper produces reaches the candidate stylesheet', async () => {
  const root = project({
    'App.tsx': APP,
    'accent.ts': "export const accent = () => 'bg-emerald-500'\n",
  })
  await serve(root)
  assert.match(candidates(root), /\.bg-emerald-500/)
})

test('editing a helper updates the candidate stylesheet', async () => {
  // The rescan inside `transform`, which is what makes a class written
  // during `next dev`/`vite dev` appear without a restart. Driven through
  // the server, so the file has to be on disk with a newer mtime -- the
  // cache skips a file it believes it has already seen.
  const root = project({
    'App.tsx': APP,
    'accent.ts': "export const accent = () => 'bg-emerald-500'\n",
  })
  const server = await serve(root)
  assert.match(candidates(root), /\.bg-emerald-500/)

  const helper = path.join(root, 'accent.ts')
  writeFileSync(helper, "export const accent = () => 'bg-rose-500'\n")
  await server.transformRequest('/accent.ts')

  const css = candidates(root)
  assert.match(css, /\.bg-rose-500/, 'the new class never reached the stylesheet')
})

test('deleting a file takes its classes with it', async () => {
  // Nothing else revisits an entry that stopped being scanned, so without
  // `watchChange` a deleted file's classes would stay in the stylesheet
  // for as long as the cache file survives.
  const root = project({
    'App.tsx': APP,
    'accent.ts': "export const accent = () => 'bg-emerald-500'\n",
  })
  const server = await serve(root)
  assert.match(candidates(root), /\.bg-emerald-500/)

  const helper = path.join(root, 'accent.ts')
  rmSync(helper)
  const plugin = server.config.plugins.find((p) => p.name === 'hozo')
  assert.ok(plugin?.watchChange, 'the plugin no longer handles watchChange')
  await (plugin.watchChange as (id: string, change: { event: string }) => unknown).call(
    plugin,
    helper,
    { event: 'delete' },
  )

  assert.doesNotMatch(candidates(root), /\.bg-emerald-500/, 'the deleted file kept its classes')
})

test('a file created while the server is up is scanned', async () => {
  const root = project({
    'App.tsx': APP,
    'accent.ts': "export const accent = () => 'bg-emerald-500'\n",
  })
  const server = await serve(root)

  const added = path.join(root, 'later.ts')
  writeFileSync(added, "export const other = () => 'bg-amber-500'\n")
  const plugin = server.config.plugins.find((p) => p.name === 'hozo')
  await (plugin!.watchChange as (id: string, change: { event: string }) => unknown).call(
    plugin,
    added,
    { event: 'create' },
  )
  await server.transformRequest('/later.ts')

  assert.match(candidates(root), /\.bg-amber-500/, 'a file created after startup was never scanned')
})

test('editing a component rewrites its stylesheet, and only when it changed', async () => {
  // The companion `.hozo.css` is written *next to the source*, inside the
  // project the watcher is watching. So a transform writes a file that
  // can trigger another transform, and the thing standing between that and
  // a loop is `writeFileIfChanged` refusing to rewrite identical bytes.
  const root = project({
    'App.tsx':
      'import { View } from \'@hozo/core\'\nexport const App = () => <View className="p-4" />\n',
  })
  const server = await serve(root)
  const companion = path.join(root, 'App.tsx.hozo.css')

  await server.transformRequest('/App.tsx')
  assert.match(readFileSync(companion, 'utf8'), /padding-top: 16px/)

  // The same module transformed again with unchanged source, which is
  // ordinary in dev -- an unrelated HMR round invalidates it and it comes
  // back through. The stylesheet must not be rewritten, or that transform
  // would invalidate the stylesheet it just wrote and start the next
  // round.
  //
  // `invalidateAll` is what makes this a test: without it Vite serves the
  // cached result, the plugin never runs, and the assertion holds for a
  // reason that has nothing to do with Hozo.
  const before = statSync(companion).mtimeMs
  server.moduleGraph.invalidateAll()
  await server.transformRequest('/App.tsx')
  assert.equal(statSync(companion).mtimeMs, before, 'an unchanged module rewrote its stylesheet')

  // A real edit does reach it.
  writeFileSync(
    path.join(root, 'App.tsx'),
    'import { View } from \'@hozo/core\'\nexport const App = () => <View className="p-8" />\n',
  )
  server.moduleGraph.invalidateAll()
  await server.transformRequest('/App.tsx')
  assert.match(
    readFileSync(companion, 'utf8'),
    /padding-top: 32px/,
    'the edit never reached the CSS',
  )
})

test("Tailwind's utilities arrive with the base layer they were written against", async () => {
  // Preflight is not a utility and names no classes: nothing in a source
  // file ever asks for `img { max-width: 100% }`. Which is exactly why a
  // project that gets the utilities and not the base sees images overflow
  // and links come out browser blue, with every class it *did* ask for
  // present and correct.
  const root = project({ 'App.tsx': APP, 'accent.ts': ACCENT })
  const server = await serve(root)

  const css = preflight(root)
  assert.match(css, /max-width: 100%/, 'images would overflow their container')
  assert.match(css, /text-decoration: inherit/, 'links would be browser blue')

  const result = await server.transformRequest('/App.tsx')
  assert.ok(result)
  assert.match(result.code, /preflight\.css/, 'the module did not import the base layer')
  // Ahead of the utilities. Element selectors lose every specificity
  // contest against a class, so this is the order with no ties to lose
  // rather than the order that wins them.
  assert.ok(
    result.code.indexOf('preflight.css') < result.code.indexOf('candidates.css'),
    'the base layer was imported after the utilities',
  )
})

test('a project with no Tailwind classes is handed no reset', async () => {
  // StyleX styles are literal property values: `{ padding: 16 }` is 16px
  // whatever the user agent thinks a `<div>` should be. Preflight is an
  // opinionated reset, and a project with no stake in Tailwind's
  // assumptions has not asked for one.
  const root = project({ 'App.tsx': NO_TAILWIND_APP })
  const server = await serve(root)

  assert.equal(candidates(root), '', 'the project was not Tailwind-free after all')
  assert.equal(preflight(root), '', "a StyleX-only project was given Tailwind's reset")

  // Still imported, and deliberately: an import that came and went as the
  // first Tailwind class was added would be a graph edge the bundler has
  // to be told about at the moment the decision flips.
  const result = await server.transformRequest('/App.tsx')
  assert.ok(result)
  assert.match(result.code, /preflight\.css/)
})

test('`preflight` overrides the inference in both directions', async () => {
  const off = project({ 'App.tsx': APP, 'accent.ts': ACCENT })
  await serve(off, { preflight: false })
  assert.equal(preflight(off), '', 'a project that declined the base layer was given one')

  const on = project({ 'App.tsx': NO_TAILWIND_APP })
  await serve(on, { preflight: true })
  assert.match(preflight(on), /max-width: 100%/, 'a project that asked for it went without')
})

test('the base layer follows the project across an edit', async () => {
  // The candidate stylesheet decides it, and that is rewritten whenever a
  // scanned file changes. A project that gains its first Tailwind class
  // while the server is up gains the base layer with it.
  const root = project({ 'App.tsx': NO_TAILWIND_APP })
  const server = await serve(root)
  assert.equal(preflight(root), '')

  writeFileSync(path.join(root, 'App.tsx'), APP)
  writeFileSync(path.join(root, 'accent.ts'), ACCENT)
  await server.transformRequest('/App.tsx')

  assert.match(preflight(root), /max-width: 100%/, 'the first Tailwind class brought no base layer')
})

test('a project whose Tailwind is all static still gets the base layer', async () => {
  // The case the first version of this got wrong. It read "does the
  // project use Tailwind" off the candidate stylesheet, and candidates are
  // by definition the classes the compiler *couldn't* read -- so a project
  // written the ordinary way, static `className` the compiler reads
  // exactly, reported none and was refused the reset it most needed.
  const root = project({
    'App.tsx':
      `import { View } from '@hozo/core'\n` + `export const App = () => <View className="p-4" />\n`,
  })
  await serve(root)

  assert.equal(candidates(root), '', 'a static class is not supposed to be a candidate')
  assert.match(preflight(root), /max-width: 100%/, 'the base layer went missing')
})

test('MDX authored against Hozo compiles, and its prose is not scanned', async () => {
  // The whole MDX path, through a real bundler with the real plugin.
  //
  // Two things have to hold at once and they pull in opposite
  // directions. The primitives written in the `.mdx` have to lower, which
  // needs Hozo to see JSX -- so this pass runs *after* the MDX plugin,
  // unlike every other file. And the prose must not reach the candidate
  // sheet, which is why `.mdx` is kept out of the project walk: on disk
  // the file is Markdown, and a byte scan of Markdown is a byte scan of
  // English.
  //
  // `jsx: true` is what makes the first half possible at all. Without it
  // `@mdx-js/mdx` folds to `_jsx()` calls, which Hozo's parser cannot
  // read. `@mdx-js/rollup` and `@next/mdx` both expose it; `@astrojs/mdx`
  // does not, which is why Astro still wants a `.tsx` island.
  const { default: mdx } = await import('@mdx-js/rollup')
  const { default: react } = await import('@vitejs/plugin-react')
  const root = project({
    'page.mdx': [
      "import { View, Text } from '@hozo/core'",
      '',
      '# A catalogue page',
      '',
      'The block layout puts the table behind a visible border, and the',
      'grid stays hidden until the isolate scrolls into view.',
      '',
      '<View className="p-4">',
      '  <Text className="text-xl">inline in MDX</Text>',
      '</View>',
      '',
    ].join('\n'),
  })
  // `jsx: true` means the MDX plugin stops before folding to `_jsx()`, so
  // something downstream has to compile the JSX it leaves behind, and
  // Vite does not do that for `.mdx` on its own. A project wiring this up
  // needs the same line -- worth knowing, because without it the failure
  // is `vite:import-analysis` complaining about invalid JS syntax, which
  // says nothing about MDX.
  //
  // Hozo before React, exactly as `examples/login-demo` has it: both are
  // ordinary plugins, order within that bucket is registration order, and
  // Hozo has to see the JSX first.
  const server = await serve(
    root,
    {},
    {},
    // React is told nothing about `.mdx`: this package's transformed pass
    // compiles the JSX it leaves behind, and asking Vite's core transform to
    // claim `.mdx` would take that step away before the pass ever runs.
    [react()],
    [
      // `enforce: 'pre'` and registered before `hozo()`: the MDX plugin
      // ships without one, so Vite's own transform would otherwise be handed
      // the raw Markdown and fail on the `#` of a heading.
      { ...mdx({ jsx: true }), enforce: 'pre' },
    ],
  )

  const result = await server.transformRequest('/page.mdx')
  assert.ok(result, 'the module was not transformed')
  assert.match(result.code, /hozo-view/, 'the View written in MDX did not lower')
  assert.doesNotMatch(result.code, /@hozo\/core/, 'the primitive import survived')

  const companion = readFileSync(path.join(root, 'page.mdx.hozo.css'), 'utf8')
  assert.match(companion, /padding-top: 16px/)
  assert.match(companion, /font-size: 20px/)

  // Every one of these is an English word and a real Tailwind utility,
  // and none of them is a class anybody wrote.
  for (const prose of ['block', 'table', 'visible', 'border', 'grid', 'hidden', 'isolate']) {
    assert.doesNotMatch(candidates(root), new RegExp(`.${prose} {`), `prose leaked: ${prose}`)
  }
})
