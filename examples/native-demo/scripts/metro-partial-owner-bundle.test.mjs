import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { withHozo, withHozoPartialOwners } from '@hozo/metro/config'
import Metro from 'metro'
import { ownerMetroFixture } from '../../../packages/metro/fixtures/owner-metro-resolver.mjs'
import { collectMetroOwnerPreflight } from '../../../packages/metro/src/owner-manifest-preflight.ts'

const require = createRequire(import.meta.url)
const fromMetro = createRequire(require.resolve('metro/package.json'))
const metroRuntimeRoot = path.dirname(fromMetro.resolve('metro-runtime/package.json'))
const asyncRequireSpecifier = 'metro-runtime/src/modules/asyncRequire'
const { getDefaultConfig } = fromMetro('metro-config')
const fromTransformer = createRequire(require.resolve('@react-native/metro-babel-transformer'))
const fromPreset = createRequire(fromTransformer.resolve('@react-native/babel-preset'))

test('production Metro bundle delivers the opt-in carrier and the generated fallback map', async (t) => {
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
    install('react-native', 'exports.StyleSheet = {create: styles => styles};')
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
      `
      const {hozoClasses} = require('@hozo/engine/project');
      exports.BottomSheet = props => ({
        interactive: props.hozoInteractiveHandleStyle?.({
          hovered: true, focused: false, pressed: false, focusVisible: false,
        }) ?? null,
        fallback: hozoClasses(props.handleClassName),
      });
    `,
      { hozo: { manifest: 'owner.json' } },
    )
    copyFileSync(
      new URL('../../../packages/patterns/hozo.manifest.json', import.meta.url),
      path.join(patterns, 'owner.json'),
    )
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
      const h = (Component, props) => Component(props);
      globalThis.partialResult = <Sheet handleClassName="p-2 opacity-100 hover:opacity-50" />;
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
      origins: [file],
      additionalImports: [
        { importer: file, specifier: '@hozo/core/generated/class-resolver' },
        { importer: file, specifier: asyncRequireSpecifier },
      ],
    })
    assert.equal(preflight.status, 'complete', JSON.stringify(preflight))
    for (const partial of [false, true]) {
      const configured = partial
        ? await withHozoPartialOwners(config, preflight, options)
        : await withHozo(config, options)
      const { code } = await Metro.runBuild(configured, {
        entry: file,
        platform,
        dev: false,
        minify: true,
      })
      const warnings = []
      const globals = { console: { ...console, warn: (message) => warnings.push(message) } }
      runInNewContext(code, globals, { timeout: 5000 })
      const { interactive, fallback } = globals.partialResult
      assert.deepEqual(Object.assign({}, ...fallback), {
        paddingTop: 14,
        paddingRight: 14,
        paddingBottom: 14,
        paddingLeft: 14,
        opacity: 1,
      })
      assert.ok(
        warnings.some((message) => /hover:opacity-50.*hands its classes no state/.test(message)),
      )
      if (partial) assert.equal(Object.assign({}, ...[interactive].flat()).opacity, 0.5)
      else assert.equal(interactive, null)
    }
  }
})
