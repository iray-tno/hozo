import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { withHozo, withHozoPartialOwners } from '@hozo/metro/config'
import Metro from 'metro'
import { ownerMetroFixture } from '../../../packages/metro/fixtures/owner-metro-resolver.mjs'
import { collectMetroOwnerPreflight } from '../../../packages/metro/src/owner-manifest-preflight.ts'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'

const require = createRequire(import.meta.url)
const fromMetro = createRequire(require.resolve('metro/package.json'))
const metroRuntimeRoot = path.dirname(fromMetro.resolve('metro-runtime/package.json'))
const asyncRequireSpecifier = 'metro-runtime/src/modules/asyncRequire'
const { getDefaultConfig } = fromMetro('metro-config')
const fromTransformer = createRequire(require.resolve('@react-native/metro-babel-transformer'))
const fromPreset = createRequire(fromTransformer.resolve('@react-native/babel-preset'))

const manifestFile = new URL('../../../packages/patterns/hozo.manifest.json', import.meta.url)
const evidenceFile = new URL(
  '../../../artifacts/style-fact-model/metro-partial-owner-bundle.json',
  import.meta.url,
)
const digest = (input) => createHash('sha256').update(input).digest('hex')

async function checkBundles(t, evidence, manifest) {
  for (const platform of ['android', 'ios']) {
    const f = ownerMetroFixture(t)
    const file = path.join(f.root, 'App.tsx')
    const appMetadata = path.join(f.root, 'package.json')
    const app = JSON.parse(readFileSync(appMetadata, 'utf8'))
    const install = (name, code, extras = {}) => {
      const root = path.join(f.root, 'node_modules', name)
      mkdirSync(root, { recursive: true })
      f.roots.push(root)
      app.dependencies[name] = '1.0.0'
      writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name,
          version: '1.0.0',
          main: './index.js',
          ...extras,
        }),
      )
      writeFileSync(path.join(root, 'index.js'), code)
      return root
    }
    install(
      'react-native',
      `
      exports.Modal = 'Modal';
      exports.View = 'View';
      exports.StyleSheet = {
        create: styles => styles,
        flatten: value => Array.isArray(value)
          ? Object.assign({}, ...value.map(exports.StyleSheet.flatten))
          : value,
      };
    `,
    )
    const react = install(
      'react',
      `
      exports.useMemo = fn => fn();
      exports.useCallback = fn => fn;
      exports.useEffect = () => {};
      exports.useState = value => [value, () => {}];
      exports.useRef = current => ({current});
    `,
    )
    writeFileSync(
      path.join(react, 'jsx-runtime.js'),
      `
      exports.jsx = exports.jsxs = (type, props) => ({type, props});
    `,
    )
    const behaviors = install(
      '@hozo/behaviors',
      `
      exports.hozoTextChildren = value => value;
      exports.useHozoMessage = () => (key, args, label) => label ?? key;
    `,
    )
    writeFileSync(path.join(behaviors, 'native.js'), 'exports.useDrag1D = () => ({handlers:{}});')
    const engine = install('@hozo/engine', '', {
      exports: {
        '.': './index.js',
        './generated/gap-styles': './gap.js',
        './generated/safe-area': './safe-area.js',
      },
    })
    const engineFile = (name) => new URL(`../../../packages/engine/dist/${name}`, import.meta.url)
    copyFileSync(engineFile('text-style.js'), path.join(engine, 'index.js'))
    copyFileSync(engineFile('authored-gap.js'), path.join(engine, 'gap.js'))
    writeFileSync(
      path.join(engine, 'safe-area.js'),
      'exports.useHozoProvidedSafeArea = () => ({top:0,right:0,bottom:0,left:0});',
    )
    // Metro resolves asyncRequire during serialization even without a dynamic
    // import. Model it as a real declared dependency of this isolated app.
    const runtime = install('metro-runtime', '')
    const runtimeModules = path.join(runtime, 'src', 'modules')
    mkdirSync(runtimeModules, { recursive: true })
    copyFileSync(
      fromMetro.resolve(asyncRequireSpecifier),
      path.join(runtimeModules, 'asyncRequire.js'),
    )
    const patterns = install(
      '@hozo/patterns',
      "export { BottomSheet } from './bottom-sheet.native.js';",
      {
        hozo: { manifest: 'owner.json' },
        dependencies: {
          react: '1',
          'react-native': '1',
          '@hozo/behaviors': '1',
          '@hozo/engine': '1',
        },
      },
    )
    for (const name of [
      'bottom-sheet.native.js',
      'sheet-rules.js',
      'safe-area-padding.native.js',
      'text-style.native.js',
    ])
      copyFileSync(
        new URL(`../../../packages/patterns/dist/${name}`, import.meta.url),
        path.join(patterns, name),
      )
    writeFileSync(
      path.join(patterns, 'pressable.native.js'),
      "export const Pressable = 'Pressable';",
    )
    writeFileSync(path.join(patterns, 'owner.json'), manifest)
    const core = install('@hozo/core', '', {
      exports: { '.': './index.js', './generated/class-resolver': './resolver.js' },
    })
    // Keep the host stub, but execute the same resolver implementation that
    // the generated map imports through the core facade in a real app.
    copyFileSync(
      new URL('../../../packages/engine/dist/class-resolver.js', import.meta.url),
      path.join(core, 'resolver.js'),
    )
    writeFileSync(appMetadata, JSON.stringify(app))
    writeFileSync(
      file,
      `
      import {BottomSheet as Sheet} from '@hozo/patterns';
      const h = (Component, props) => {
        globalThis.carrierSupplied = typeof props.hozoInteractiveHandleStyle === 'function';
        return Component(props);
      };
      const render = detents => <Sheet open detents={detents}
        handleClassName="p-2 opacity-100 hover:opacity-50" handleStyle={{paddingTop: 21}} />;
      function find(node, predicate) {
        if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
        if (!node?.props) return;
        if (typeof node.type === 'function') return find(node.type(node.props), predicate);
        if (predicate(node.props)) return node.props;
        return find(node.props.children, predicate);
      }
      const interactive = find(render([0.5, 1]), props => props.accessibilityRole === 'button');
      const decorative = find(render([1]), props =>
        props.importantForAccessibility === 'no-hide-descendants' && Array.isArray(props.style));
      globalThis.partialResult = {
        interactive: interactive.style({hovered:true,focused:false,pressed:false,focusVisible:false}),
        fallback: decorative.style,
        carrierSupplied: globalThis.carrierSupplied,
      };
    `,
    )
    writeFileSync(path.join(f.root, 'global.css'), '@theme {--spacing:7px;} @tailwind utilities;')
    const upstream = path.join(f.root, 'upstream.cjs')
    writeFileSync(
      upstream,
      `
      const babel = require(${JSON.stringify(fromTransformer.resolve('@babel/core'))});
      const jsx = require(${JSON.stringify(fromPreset.resolve('@babel/plugin-transform-react-jsx'))});
      exports.transform = ({src, filename}) => babel.transformSync(src, {
        filename, configFile: false, babelrc: false, ast: true, code: false,
        plugins: [[jsx, {pragma: 'h'}]],
      });
    `,
    )
    const defaults = await getDefaultConfig(f.root)
    const config = {
      ...defaults,
      // The fixture lives outside the workspace, but Metro injects its
      // require polyfill from the installed metro-runtime package.
      watchFolders: [f.root, metroRuntimeRoot, ...defaults.watchFolders],
      maxWorkers: 1,
      resetCache: true,
      resolver: { ...defaults.resolver, useWatchman: false },
      transformer: {
        ...defaults.transformer,
        babelTransformerPath: upstream,
        asyncRequireModulePath: asyncRequireSpecifier,
        // The fixture Babel pass lowers JSX only. Let Metro lower ESM before
        // its module wrapper instead of leaving imports inside that wrapper.
        async getTransformOptions(...args) {
          const base = await defaults.transformer.getTransformOptions(...args)
          return { ...base, transform: { ...base.transform, experimentalImportSupport: true } }
        },
      },
    }
    const options = { css: 'global.css', content: { packages: [] } }
    const preflight = collectMetroOwnerPreflight(f.context, f.delegate, {
      platform,
      epoch: 'partial-owner-bundle',
      origins: [file, path.join(patterns, 'index.js')],
      additionalImports: [
        { importer: file, specifier: '@hozo/core/generated/class-resolver' },
        { importer: file, specifier: asyncRequireSpecifier },
        ...[
          'react/jsx-runtime',
          '@hozo/behaviors/native',
          '@hozo/engine/generated/gap-styles',
          '@hozo/engine/generated/safe-area',
        ].map((specifier) => ({ importer: path.join(patterns, 'index.js'), specifier })),
      ],
    })
    assert.equal(preflight.status, 'complete', JSON.stringify(preflight))
    for (const partial of [false, true]) {
      const configured = partial
        ? await withHozoPartialOwners(config, preflight, options)
        : await withHozo(config, options)
      const resolve = configured.resolver.resolveRequest
      configured.resolver.resolveRequest = (context, specifier, target) => {
        try {
          return resolve(context, specifier, target)
        } catch (error) {
          throw new Error(`Bundle dependency ${specifier} from ${context.originModulePath}`, {
            cause: error,
          })
        }
      }
      const { code } = await Metro.runBuild(configured, {
        entry: file,
        platform,
        dev: false,
        minify: true,
      })
      const warnings = []
      const globals = { console: { ...console, warn: (message) => warnings.push(message) } }
      runInNewContext(code, globals, { timeout: 5000 })
      const { interactive, fallback, carrierSupplied } = globals.partialResult
      assert.equal(carrierSupplied, partial)
      const fallbackStyle = Object.assign({}, ...fallback.flat(Infinity))
      assert.deepEqual(fallbackStyle, {
        paddingTop: 21,
        paddingRight: 14,
        paddingBottom: 14,
        paddingLeft: 14,
        opacity: 1,
      })
      const missingStateDiagnostic = warnings.some((message) =>
        /hover:opacity-50.*hands its classes no state/.test(message),
      )
      assert.ok(missingStateDiagnostic)
      const hovered = Object.assign({}, ...interactive.flat(Infinity))
      assert.equal(hovered.opacity, 0.5)
      assert.equal(hovered.paddingTop, 21)
      evidence.builds.push({
        platform,
        mode: partial ? 'opt-in' : 'ordinary',
        bundleSha256: digest(code),
        carrierSupplied,
        fallbackStyle,
        missingStateDiagnostic,
        hover: { opacity: hovered.opacity, paddingTop: hovered.paddingTop },
      })
    }
  }
}

test('production Metro bundle delivers partial and fallback styles to real BottomSheet code', async (t) => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    scope: 'metro-production-owner-bundle-host-standins',
    passed: false,
    builds: [],
  }
  try {
    const manifest = readFileSync(manifestFile)
    evidence.manifestSha256 = digest(manifest)
    await checkBundles(t, evidence, manifest)
    evidence.passed = true
  } catch (error) {
    evidence.error = String(error)
    throw error
  } finally {
    mkdirSync(path.dirname(fileURLToPath(evidenceFile)), { recursive: true })
    writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`)
  }
})
