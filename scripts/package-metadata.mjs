// The publishing metadata for every package, in one place.
//
// The published packages need the same eight fields to agree, and a registry is
// unforgiving about disagreement: a wrong `exports` path produces a
// package that installs cleanly and imports nothing, and npm has no undo
// past 72 hours. Keeping the shape here rather than in every package means
// the answer to "what does a Hozo package look like" has one place to be
// wrong in; `check-packages.mjs` re-derives it and fails on any hand edit
// that drifted, then looks inside the tarballs to see whether the answer
// was true.
//
//   node scripts/package-metadata.mjs        # write
//   node scripts/package-metadata.mjs --check # verify, exit 1 on drift
//
// Deliberately *not* a generator that owns the whole file: each package's
// dependencies, peer ranges and scripts are its own business. This writes
// only the fields listed in `SHARED` and `PACKAGES`.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The version every package publishes at. They release in lockstep.
 *
 * Read from a package rather than written here, because Changesets owns
 * it: a release bumps all packages together (`.changeset/config.json` has them
 * as a `fixed` group), and a constant in this file would be rewritten back
 * over the bump on the next run. `check-packages.mjs` is what makes the
 * lockstep an assertion rather than an intention.
 */
export const VERSION = JSON.parse(
  readFileSync(path.join(root, 'packages', 'compiler', 'package.json'), 'utf8'),
).version

const REPOSITORY = 'https://github.com/iray-tno/hozo'

/**
 * Per-package entry points and keywords.
 *
 * `main`/`exports` name `./dist` rather than `./src`, in the workspace as
 * well as in the tarball. The alternative -- source in the workspace,
 * `dist` swapped in by `publishConfig` at publish time -- keeps the dev
 * loop a step shorter, and was rejected twice over. `@hozo/core` and
 * `@hozo/behaviors` are `.tsx`, and Node's type stripping does not transform
 * JSX, so those two cannot be loaded from source at all. And the two bugs
 * this build's first type-check turned up had both survived by the
 * published shape never being the shape under test.
 */
const PACKAGES = {
  canvas: {
    exports: { '.': './dist/index.js' },
    native: true,
    keywords: ['react-native', 'canvas', 'graphics', 'skia', 'charts'],
  },
  compiler: {
    exports: {
      '.': './dist/index.js',
      './project': './dist/project.js',
      './lower': './dist/lower.js',
      './canvas': './dist/canvas.js',
      './diagnostics': './dist/diagnostics.js',
      './sources': './dist/sources.js',
    },
    keywords: ['react-native', 'compiler', 'rust', 'napi', 'tailwind'],
  },
  core: {
    exports: { '.': './dist/index.js' },
    native: true,
    keywords: ['react-native', 'react', 'components', 'accessibility', 'universal'],
  },
  primitives: {
    exports: { '.': './dist/index.js' },
    native: true,
    keywords: ['react-native', 'react', 'primitives', 'components', 'universal'],
  },
  semantics: {
    exports: { '.': './dist/index.js' },
    // Absent until now, and `index.native.tsx` was unreachable because of
    // it: Metro resolved the DOM build and rendered <div> on a phone.
    native: true,
    keywords: ['react-native', 'react', 'semantics', 'landmarks', 'accessibility', 'universal'],
  },
  typography: {
    exports: {
      '.': './dist/index.js',
      './fonts': './dist/fonts.js',
      './fonts/expo': './dist/fonts-expo.js',
      './fonts/native': './dist/fonts-native.js',
    },
    noNative: ['./fonts', './fonts/expo', './fonts/native'],
    native: true,
    keywords: ['react-native', 'react', 'typography', 'cjk', 'ruby', 'accessibility'],
  },
  runtime: {
    // `./svg` is a separate entry because `react-native-svg` is an
    // optional peer dependency, and a re-export from the main entry would
    // load it on every import of this package -- an optional dependency
    // that is always loaded is not optional. The compiler emits an import
    // from here only for a file that uses an SVG element.
    exports: {
      '.': './dist/index.js',
      './navigation': './dist/navigation-entry.js',
      './project': './dist/project.js',
      './svg': './dist/svg.js',
    },
    // Metro resolves `.native.js` by filename suffix only while a package
    // has no `exports`; once it does, conditions take over and the suffix
    // is ignored. Naming the condition is what keeps the native build
    // reaching `index.native.js` instead of the DOM one.
    native: true,
    // This module registers the one-per-app subscriptions that feed the
    // ambient Native stores. Every other runtime module is declaration-only
    // at import time and can be removed when none of its exports are used.
    sideEffects: ['./dist/hooks.native.js'],
    keywords: ['react-native', 'runtime', 'styles', 'animation'],
  },
  navigation: {
    exports: {
      '.': './dist/index.js',
      './typed': './dist/typed.js',
      './next': './dist/next.js',
      './expo-router': './dist/expo-router.js',
      './expo-router/typed': './dist/expo-typed.js',
      './expo-config': './dist/expo-config.js',
      './tanstack-router': './dist/tanstack-router.js',
      './tanstack-router/typed': './dist/tanstack-typed.js',
      './verification': './dist/verification.js',
      './verification/node': './dist/verification-node.js',
      './hozo-links.schema.json': './hozo-links.schema.json',
    },
    // Pure verification data can use the default build everywhere, while
    // the writer is deliberately Node-only. Neither has a `.native` peer.
    noNative: [
      './typed',
      './expo-router/typed',
      './expo-config',
      './tanstack-router/typed',
      './verification',
      './verification/node',
    ],
    files: ['dist', 'hozo-links.schema.json'],
    native: true,
    keywords: ['react-native', 'react', 'navigation', 'router', 'deep-linking', 'universal'],
  },
  behaviors: {
    exports: { '.': './dist/index.js' },
    native: true,
    keywords: [
      'react-native',
      'behaviors',
      'focus',
      'roving-focus',
      'typeahead',
      'popper',
      'floating-ui',
      'portal',
      'live-region',
    ],
  },
  tailwind: {
    exports: { '.': './dist/index.js' },
    keywords: ['tailwindcss', 'theme', 'design-tokens', 'react-native'],
  },
  vite: {
    exports: { '.': './dist/index.js' },
    keywords: ['vite', 'vite-plugin', 'react-native', 'react-native-web'],
  },
  next: {
    // `loader.js` stays plain JavaScript at the package root: a webpack or
    // Turbopack loader is resolved and executed by the bundler, which is
    // not going to compile it first.
    exports: { '.': './dist/index.js', './loader': './loader.js' },
    files: ['dist', 'loader.js'],
    keywords: ['nextjs', 'next', 'webpack', 'turbopack', 'react-native-web'],
  },
  metro: {
    exports: {
      '.': './dist/index.js',
      './config': './dist/config.js',
      './project': './dist/project.js',
    },
    keywords: ['metro', 'react-native', 'expo', 'transformer'],
  },
  'migration-audit': {
    exports: { '.': './src/index.mjs' },
    excludeMjsTests: true,
    files: ['src'],
    keywords: ['react-native', 'migration', 'audit', 'compiler', 'conformance'],
  },
  storybook: {
    // Same reason as the Next loader: Storybook reads `preset.js` itself.
    exports: { '.': './preset.js', './preset': './preset.js' },
    files: ['dist', 'preset.js'],
    keywords: ['storybook', 'storybook-addon', 'react-native', 'vite'],
  },
}

/** Fields every package gets, identically. */
function shared(name) {
  return {
    version: VERSION,
    license: 'MIT',
    // `workspace:^` rather than `workspace:*` throughout. pnpm turns the
    // first into `^0.1.0` and the second into an exact `0.1.0`; an exact
    // pin means a project holding two Hozo packages one patch apart gets
    // two copies of the compiler, and so two native addons and two caches.
    repository: { type: 'git', url: `git+${REPOSITORY}.git`, directory: `packages/${name}` },
    homepage: `${REPOSITORY}/tree/main/packages/${name}#readme`,
    bugs: { url: `${REPOSITORY}/issues` },
    publishConfig: { access: 'public', provenance: true },
  }
}

/** The full metadata a package's `package.json` must carry. */
export function metadataFor(name) {
  const spec = PACKAGES[name]
  if (!spec) throw new Error(`no metadata defined for packages/${name}`)
  const exportsField = {}
  for (const [subpath, target] of Object.entries(spec.exports)) {
    const types = target.replace(/\.js$/, '.d.ts')
    const native = target.replace(/\.js$/, '.native.js')
    // The resolver takes the first matching condition, so order is the
    // whole meaning of this map.
    //
    // `types` used to be first, on the reasoning that a `default` ahead of
    // it would win for a TypeScript consumer. True, and it also won over
    // `react-native` -- which is the condition every React Native project
    // is already asking for: `expo/tsconfig.base` and
    // `@react-native/typescript-config` both set `customConditions:
    // ["react-native"]`. So `tsc` on device asked for the native entry
    // point, matched `types`, and was handed the *Web* declarations, for
    // the whole life of the Native backend. Nothing failed loudly: the app
    // bundles and runs correctly either way, because Metro reads this map
    // with its own conditions and never looks at `types` at all.
    //
    // What it cost is in `@hozo/tailwind-conformance/src/class-name-parity.test.ts`
    // and in `packages/runtime/src/class-name.native.ts`: a native-only
    // export read as missing, and every native prop type went unchecked --
    // not one of them declared `className`, the prop the whole authoring
    // model is built on.
    //
    // So `react-native` comes first, with `types` of its own inside it.
    // A resolver that doesn't set the condition falls through to exactly
    // the map that was here before.
    exportsField[subpath] = target.startsWith('./dist')
      ? // Every subpath, not only the root. `@hozo/runtime/svg` has a
        // `.native.js` of its own and was getting the plain map, so Metro
        // resolved the Web file -- which re-exports nothing -- and the
        // components the compiler imported from it did not exist.
        spec.native && !spec.noNative?.includes(subpath)
        ? {
            'react-native': { types: native.replace(/\.js$/, '.d.ts'), default: native },
            types,
            default: target,
          }
        : { types, default: target }
      : target
  }
  // An `exports` map is a closed door: every subpath not named in it stops
  // resolving, `./package.json` included. Metro reads it, and so does the
  // native-render harness here -- both broke the moment these packages
  // gained an `exports` field at all. Re-exporting it is the standard
  // answer and costs nothing.
  exportsField['./package.json'] = './package.json'
  const main = spec.exports['.']
  return {
    ...shared(name),
    main,
    types: main.startsWith('./dist') ? main.replace(/\.js$/, '.d.ts') : undefined,
    exports: exportsField,
    // Bundlers cannot cross a package boundary safely until the package says
    // which modules execute work merely by being imported. One explicit
    // runtime exception preserves the Native ambient listeners; every other
    // generated package is side-effect-free.
    sideEffects: spec.sideEffects ?? false,
    // `src` ships alongside `dist` because the build emits
    // `declarationMap` and `sourceMap`, and a map whose source is absent
    // points nowhere. With it, a stack trace through Hozo lands on the
    // real line and "go to definition" reaches the commented original,
    // which for a compiler is worth the few kilobytes. Tests are excluded
    // by name -- npm honours negations here. Benchmarks follow the same
    // rule: useful in the repository, but not part of the package API.
    files: [
      ...(spec.files ?? ['dist']),
      ...(!spec.files?.includes('src') ? ['src'] : []),
      '!src/**/*.test.ts',
      '!src/**/*.test.tsx',
      ...(spec.excludeMjsTests ? ['!src/**/*.test.mjs'] : []),
      '!src/**/*.bench.ts',
    ],
    keywords: spec.keywords,
  }
}

export const PACKAGE_NAMES = Object.keys(PACKAGES)

/** The order `package.json` keys are written in, for a readable diff. */
const KEY_ORDER = [
  'name',
  'version',
  'description',
  'keywords',
  'license',
  'repository',
  'homepage',
  'bugs',
  'type',
  'main',
  'types',
  'sideEffects',
  'bin',
  'exports',
  'files',
  'publishConfig',
  'scripts',
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'devDependencies',
]

function ordered(json) {
  const out = {}
  for (const key of KEY_ORDER) if (key in json) out[key] = json[key]
  for (const key of Object.keys(json)) if (!(key in out)) out[key] = json[key]
  return out
}

/** `package.json` for `name`, with the shared metadata applied. */
export function applyMetadata(name) {
  const file = path.join(root, 'packages', name, 'package.json')
  const json = JSON.parse(readFileSync(file, 'utf8'))
  delete json.private
  const merged = { ...json, ...metadataFor(name) }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  // Workspace dependencies all use the caret protocol; see `shared`.
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [dep, range] of Object.entries(merged[field] ?? {})) {
      if (range.startsWith('workspace:')) merged[field][dep] = 'workspace:^'
    }
  }
  return { file, text: `${JSON.stringify(ordered(merged), null, 2)}\n` }
}

if (import.meta.filename === process.argv[1]) {
  const check = process.argv.includes('--check')
  let drifted = 0
  for (const name of PACKAGE_NAMES) {
    const { file, text } = applyMetadata(name)
    if (check) {
      if (readFileSync(file, 'utf8') !== text) {
        console.error(`drift: packages/${name}/package.json`)
        drifted += 1
      }
    } else {
      writeFileSync(file, text)
    }
  }
  if (check && drifted > 0) {
    console.error(`\n${drifted} package.json out of date. Run: node scripts/package-metadata.mjs`)
    process.exit(1)
  }
  console.log(check ? 'package metadata up to date' : `wrote ${PACKAGE_NAMES.length} package.json`)
}
