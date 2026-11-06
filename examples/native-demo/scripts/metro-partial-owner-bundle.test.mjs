import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import {
  withHozo,
  withHozoOwnerCallers,
  withHozoPartialOwners,
  withHozoPartialOwnersOrOrdinary,
} from '@hozo/metro/config'
import Metro from 'metro'
import { ownerMetroFixture } from '../../../packages/metro/fixtures/owner-metro-resolver.mjs'
import { collectMetroOwnerPreflight } from '../../../packages/metro/src/owner-manifest-preflight.ts'
import { observeMetroOwnerPreflight } from '../../../packages/metro/src/owner-preflight-observer.ts'
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
const toolbarEvidenceFile = new URL(
  '../../../artifacts/style-fact-model/metro-toolbar-owner-bundle.json',
  import.meta.url,
)
const digest = (input) => createHash('sha256').update(input).digest('hex')
// The names of the two text style modules, assembled so this file scans as
// no class. It sits in the demo's project, whose candidate scan reads it like
// the app's own source: written out whole, the names were read as text colour
// utilities and left an unresolved colour in the demo's bundle, which its
// theme check rejects.
const textStyle = (suffix) => ['text', `style${suffix}`].join('-')

function fixtureProps(props, children) {
  const base = props ?? {}
  return children.length
    ? { ...base, children: children.length === 1 ? children[0] : children }
    : base
}

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
    copyFileSync(engineFile(textStyle('.js')), path.join(engine, 'index.js'))
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
      "export { BottomSheet } from './bottom-sheet.native.js';export {Toolbar,HozoToolbar} from './toolbar.native.js';",
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
      'toolbar.native.js',
      'sheet-rules.js',
      'safe-area-padding.native.js',
      textStyle('.native.js'),
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
    // Model a regular installed dependency with platform exports, but no
    // owner manifest. Its runtime-selected classes must stay on the ordinary
    // resolver even when a neighboring literal gets a prepared carrier.
    const handleInput = install('handle-input', 'throw new Error("Expected a platform export")', {
      exports: { '.': { android: './android.js', ios: './ios.js', default: './index.js' } },
    })
    for (const target of ['android', 'ios'])
      writeFileSync(
        path.join(handleInput, `${target}.js`),
        `export const inputPlatform = ${JSON.stringify(target)};
        export const readHandleClass = () => globalThis.handleInput;
        export const readToolbarClass = () => {globalThis.toolbarRuntimeReads++;return globalThis.toolbarInput};`,
      )
    // Identical literal input in a real Metro-reachable sibling is still not
    // eligible: the current partial transform requires an exact caller route.
    const uncapturedFile = path.join(f.root, 'Uncaptured.tsx')
    const handleClass = 'p-2 opacity-100 hover:opacity-50'
    writeFileSync(
      uncapturedFile,
      `
      import {BottomSheet as Sheet,Toolbar} from '@hozo/patterns';
      export const renderUncaptured = (h, detents) => <Sheet open detents={detents}
        handleClassName="${handleClass}" handleStyle={{paddingTop: 21}} />;
      export const renderUncapturedToolbar = (h, items, author) => <Toolbar accessibilityLabel="Tools" items={items}
        className="p-2 gap-x-3 gap-y-4" style={author.value}/>;
    `,
    )
    const nestedFile = path.join(f.root, 'Nested.tsx')
    writeFileSync(
      nestedFile,
      `
      import {View} from 'react-native';import {Toolbar} from '@hozo/patterns';
      export const renderNestedToolbar=(h,items,author)=> <View className="p-2">
        <Toolbar accessibilityLabel="Tools" items={items} className="p-2 gap-x-3 gap-y-4" style={author.value}/></View>;
    `,
    )
    writeFileSync(appMetadata, JSON.stringify(app))
    writeFileSync(
      file,
      `
      import {BottomSheet as Sheet,Toolbar,HozoToolbar as Alias} from '@hozo/patterns';
      import {View} from 'react-native';
      import {inputPlatform, readHandleClass, readToolbarClass} from 'handle-input';
      import {renderUncaptured,renderUncapturedToolbar} from './Uncaptured';
      import {renderNestedToolbar} from './Nested';
      const withChildren=${fixtureProps.toString()};
      const h = (Component, props, ...children) => {
        props=withChildren(props,children);
        if(Component===Toolbar) {
          globalThis.toolbarCarrierSupplied = typeof props.hozoToolbarStyle === 'function';
          globalThis.toolbarPlan=props.hozoToolbarStyle;
        }
        else globalThis.carrierSupplied = typeof props.hozoInteractiveHandleStyle === 'function';
        return typeof Component==='function' ? Component(props) : {type:Component,props};
      };
      globalThis.ordinaryRoot=<View accessibilityLabel="Ordinary box" className="p-2"/>;
      const render = detents => <Sheet open detents={detents}
        handleClassName="${handleClass}" handleStyle={{paddingTop: 21}} />;
      const renderOpaque = detents => <Sheet open detents={detents}
        handleClassName={readHandleClass()} handleStyle={{paddingTop: 21}} />;
      function find(node, predicate) {
        if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
        if (!node?.props) return;
        if (typeof node.type === 'function') return find(node.type(node.props), predicate);
        if (predicate(node.props)) return node.props;
        return find(node.props.children, predicate);
      }
      function observe(renderHandle) {
        const interactive = find(renderHandle([0.5, 1]), props => props.accessibilityRole === 'button');
        const interactiveCarrier = globalThis.carrierSupplied;
        const decorative = find(renderHandle([1]), props =>
          props.importantForAccessibility === 'no-hide-descendants' && Array.isArray(props.style));
        const rest = {hovered:false,focused:false,pressed:false,focusVisible:false};
        return {
          interactive: interactive.style({...rest, hovered: true}),
          rest: interactive.style(rest),
          fallback: decorative.style,
          carrierSupplied: interactiveCarrier,
          decorativeCarrierSupplied: globalThis.carrierSupplied,
        };
      }
      globalThis.partialResult = {
        inputPlatform,
        literal: observe(render),
        opaque: observe(renderOpaque),
        uncaptured: observe(detents => renderUncaptured(h, detents)),
      };
      const toolbarItems=[{render:wiring=>{globalThis.toolbarItemKeys=Object.keys(wiring);return {
        type:'Pressable',props:{accessibilityLabel:'Toolbar action',onPress:()=>{globalThis.toolbarActions++}}
      }}}];
      const toolbarAuthor={get value(){globalThis.toolbarAuthorReads++;return {paddingTop:21,rowGap:5}}};
      const renderToolbar=()=> <Toolbar accessibilityLabel="Tools" items={toolbarItems}
        className="p-2 gap-x-3 gap-y-4" style={toolbarAuthor.value}/>;
      const renderAliasToolbar=()=> <Alias accessibilityLabel="Tools" items={toolbarItems}
        className="p-2 gap-x-3 gap-y-4" style={toolbarAuthor.value}/>;
      const renderOpaqueToolbar=()=> <Toolbar accessibilityLabel="Tools" items={toolbarItems}
        className={readToolbarClass()} style={toolbarAuthor.value}/>;
      function observeToolbar(render){
        globalThis.toolbarRuntimeReads=0;globalThis.toolbarAuthorReads=0;globalThis.toolbarActions=0;
        const tree=render();const owner=find(tree,props=>props.accessibilityRole==='toolbar');
        (globalThis.toolbarPlans??=[]).push(globalThis.toolbarPlan);
        const action=find(tree,props=>props.accessibilityLabel==='Toolbar action');action.onPress();
        return {carrierSupplied:globalThis.toolbarCarrierSupplied,style:owner.style,
          role:owner.accessibilityRole,label:owner.accessibilityLabel,
          privateLeak:Object.hasOwn(owner,'hozoToolbarStyle'),itemKeys:globalThis.toolbarItemKeys,
          runtimeReads:globalThis.toolbarRuntimeReads,authorReads:globalThis.toolbarAuthorReads,
          actions:globalThis.toolbarActions};
      }
      globalThis.toolbarResult={literal:observeToolbar(renderToolbar),alias:observeToolbar(renderAliasToolbar),opaque:observeToolbar(renderOpaqueToolbar),
        nested:observeToolbar(()=>renderNestedToolbar(h,toolbarItems,toolbarAuthor)),
        uncaptured:observeToolbar(()=>renderUncapturedToolbar(h,toolbarItems,toolbarAuthor))};
      globalThis.sharedToolbarPlan=typeof globalThis.toolbarPlans[0]==='function' &&
        globalThis.toolbarPlans[0]===globalThis.toolbarPlans[1];
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
      resolver: {
        ...defaults.resolver,
        useWatchman: false,
        // Keep build resolution aligned with the preflight fixture's explicit
        // package-export conditions. Metro's stock Native config does not
        // assert the Android/iOS condition names for this package by default.
        unstable_conditionsByPlatform: {
          ...defaults.resolver.unstable_conditionsByPlatform,
          ...f.context.unstable_conditionsByPlatform,
        },
      },
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
    const capture = {
      platform,
      epoch: 'partial-owner-bundle',
      origins: [file, nestedFile, path.join(patterns, 'index.js')],
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
    }
    const preflight = collectMetroOwnerPreflight(f.context, f.delegate, capture)
    assert.equal(preflight.status, 'complete', JSON.stringify(preflight))
    // Keep the explicit subpath inventory valid, then exhaust the budget
    // while traversing the larger dependency closure.
    const maxEdges = capture.additionalImports.length
    assert.ok(preflight.routes.length > maxEdges)
    let resolvedEdges = 0
    const limited = collectMetroOwnerPreflight(
      f.context,
      (...args) => {
        resolvedEdges++
        return f.delegate(...args)
      },
      { ...capture, maxEdges },
    )
    assert.equal(limited.status, 'incomplete', JSON.stringify(limited))
    assert.equal(limited.reason, 'edge-budget', JSON.stringify(limited))
    assert.equal(resolvedEdges, maxEdges)
    assert.ok(
      preflight.routes.some((row) => row.importer === file && row.specifier === '@hozo/patterns'),
    )
    assert.ok(!preflight.routes.some((row) => row.importer === uncapturedFile))
    // Ordinary Metro modularizes Hozo barrels before resolution. Observe an
    // import that stays in the graph, then prove the owner route in the
    // captured declaration closure instead of assuming the barrel survives.
    const observer = observeMetroOwnerPreflight(
      { importer: file, specifier: 'handle-input' },
      capture,
    )
    let livePreflight
    let ordinaryBundleSha256
    for (const mode of ['ordinary', 'opt-in', 'budget-fallback', 'toolbar-opt-in']) {
      const partial = mode === 'opt-in'
      const fallback =
        mode === 'budget-fallback'
          ? await withHozoPartialOwnersOrOrdinary(config, limited, options)
          : undefined
      if (fallback)
        assert.deepEqual(fallback.admission, { route: 'ordinary-fallback', reason: 'edge-budget' })
      async function build(observe) {
        const observingConfig = observe && {
          ...config,
          resolver: {
            ...config.resolver,
            resolveRequest: (context, specifier, target) =>
              observe(context, specifier, target, context.resolveRequest),
          },
        }
        const configured =
          fallback?.config ??
          (mode === 'toolbar-opt-in'
            ? await withHozoOwnerCallers(config, livePreflight, 'Toolbar.root', options)
            : partial
              ? await withHozoPartialOwners(config, livePreflight, options)
              : await withHozo(observingConfig, options))
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
        return Metro.runBuild(configured, { entry: file, platform, dev: false, minify: true })
      }
      const { output, preflight: observed } =
        mode === 'ordinary' ? await observer.run(build) : { output: await build() }
      const { code } = output
      if (mode === 'ordinary') {
        ordinaryBundleSha256 = digest(code)
        livePreflight = observed
        assert.equal(livePreflight?.status, 'complete', JSON.stringify(livePreflight))
        assert.ok(!livePreflight.routes.some((route) => route.importer === uncapturedFile))
        assert.ok(
          livePreflight.routes.some(
            (route) =>
              route.importer === file &&
              route.specifier === '@hozo/patterns' &&
              route.entry === path.join(patterns, 'index.js'),
          ),
        )
        assert.ok(
          livePreflight.routes.some(
            (route) =>
              route.importer === file &&
              route.specifier === 'handle-input' &&
              route.entry === path.join(handleInput, `${platform}.js`),
          ),
        )
      }
      const warnings = []
      const globals = {
        console: { ...console, warn: (message) => warnings.push(message) },
        handleInput: handleClass,
        toolbarInput: 'p-2 gap-x-3 gap-y-4',
      }
      runInNewContext(code, globals, { timeout: 5000 })
      const { inputPlatform, literal, opaque, uncaptured } = globals.partialResult
      const { carrierSupplied } = literal
      const flatten = (style) => Object.assign({}, ...[style].flat(Infinity))
      const ordinaryPrimitive = {
        host: globals.ordinaryRoot.type,
        style: flatten(globals.ordinaryRoot.props.style),
        classNameLeaked: Object.hasOwn(globals.ordinaryRoot.props, 'className'),
      }
      const toolbar = globals.toolbarResult
      const observedToolbar = {}
      // Store the actual controls before asserting so a failed platform/mode
      // remains inspectable instead of disappearing from the receipt.
      evidence.toolbarBuilds.push({
        platform,
        mode,
        inputPlatform,
        bundleSha256: digest(code),
        bundleBytes: Buffer.byteLength(code),
        sharedAliasPlan: globals.sharedToolbarPlan,
        ordinaryPrimitive,
        routes: observedToolbar,
        capture: {
          source: 'ordinary-metro-resolver',
          fingerprint: livePreflight.fingerprint,
          routes: livePreflight.routes.length,
          ordinaryBundleSha256,
        },
      })
      assert.deepEqual(ordinaryPrimitive, {
        host: 'View',
        style: { paddingTop: 14, paddingRight: 14, paddingBottom: 14, paddingLeft: 14 },
        classNameLeaked: false,
      })
      for (const [route, control] of Object.entries(toolbar)) {
        const style = flatten(control.style)
        observedToolbar[route] = { ...control, style, itemKeys: [...control.itemKeys] }
        assert.deepEqual(
          style,
          {
            paddingTop: 21,
            paddingRight: 14,
            paddingBottom: 14,
            paddingLeft: 14,
            rowGap: 5,
            columnGap: 21,
          },
          `${platform}/${mode}/${route}`,
        )
        assert.equal(
          control.carrierSupplied,
          mode === 'toolbar-opt-in' && ['literal', 'alias'].includes(route),
        )
        assert.equal(control.role, 'toolbar')
        assert.equal(control.label, 'Tools')
        assert.equal(control.privateLeak, false)
        assert.deepEqual([...control.itemKeys], [])
        assert.equal(control.authorReads, 1)
        assert.equal(control.runtimeReads, route === 'opaque' ? 1 : 0)
        assert.equal(control.actions, 1)
      }
      assert.equal(globals.sharedToolbarPlan, mode === 'toolbar-opt-in')
      assert.equal(inputPlatform, platform)
      assert.equal(carrierSupplied, partial)
      assert.equal(literal.decorativeCarrierSupplied, partial)
      const fallbackStyle = flatten(literal.fallback)
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
      const hovered = flatten(literal.interactive)
      assert.equal(hovered.opacity, 0.5)
      assert.equal(hovered.paddingTop, 21)
      assert.deepEqual(flatten(literal.rest), fallbackStyle)
      function ordinaryControl(control) {
        const result = {
          carrierSupplied: control.carrierSupplied,
          decorativeCarrierSupplied: control.decorativeCarrierSupplied,
          rest: flatten(control.rest),
          hover: flatten(control.interactive),
          fallback: flatten(control.fallback),
        }
        assert.deepEqual(result, {
          carrierSupplied: false,
          decorativeCarrierSupplied: false,
          rest: fallbackStyle,
          hover: hovered,
          fallback: fallbackStyle,
        })
        return result
      }
      const row = {
        platform,
        mode,
        bundleSha256: digest(code),
        carrierSupplied,
        fallbackStyle,
        missingStateDiagnostic,
        hover: { opacity: hovered.opacity, paddingTop: hovered.paddingTop },
        ordinaryControl: {
          inputPlatform,
          ...ordinaryControl(opaque),
        },
        uncapturedControl: ordinaryControl(uncaptured),
        ...(partial && {
          capture: {
            source: 'ordinary-metro-resolver',
            fingerprint: livePreflight.fingerprint,
            routes: livePreflight.routes.length,
            ordinaryBundleSha256,
          },
        }),
      }
      if (fallback) evidence.budgetFallbacks.push({ ...row, admission: fallback.admission })
      else if (mode !== 'toolbar-opt-in') evidence.builds.push(row)
    }
  }
}

test('production Metro bundles deliver selected BottomSheet and Toolbar owners and ordinary controls', async (t) => {
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    scope: 'metro-production-owner-bundle-host-standins',
    passed: false,
    builds: [],
    budgetFallbacks: [],
    toolbarBuilds: [],
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
    writeFileSync(
      toolbarEvidenceFile,
      `${JSON.stringify(
        {
          schema: 3,
          sourceCommit: evidence.sourceCommit,
          trackedChanges: evidence.trackedChanges,
          scope: 'metro-production-toolbar-owner-host-standins',
          passed: evidence.passed,
          manifestSha256: evidence.manifestSha256,
          builds: evidence.toolbarBuilds,
          ...(evidence.error && { error: evidence.error }),
        },
        null,
        2,
      )}\n`,
    )
  }
})

test('fixture preserves classic JSX children instead of losing the nested owner tree', () => {
  const first = { type: 'Toolbar', props: { onPress: () => true } },
    second = { type: 'View' }
  const props = { style: { paddingTop: 14 } }
  assert.equal(fixtureProps(props, []), props)
  assert.deepEqual(fixtureProps(props, [first]), { ...props, children: first })
  assert.deepEqual(fixtureProps(null, [first, second]), { children: [first, second] })
  assert.equal(fixtureProps(props, [first]).children.props.onPress(), true)
  assert.equal(Object.hasOwn(props, 'children'), false)
  // The exact serialized helper is what the real Metro fixture executes.
  const emitted = runInNewContext(`(${fixtureProps.toString()})`)
  assert.equal(emitted(props, [first]).children, first)
})
