// Real emitted caller -> published package contract -> actual Toolbar source.
// RN hosts are stand-ins; this does not establish device or text inheritance fidelity.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import { ownerFixtureShadow } from '../../../scripts/style-slots/owner-fixture.mjs'
import { createCompiler, openCandidateCache } from '../../compiler/src/index.ts'
import { previewOwnerLiteralCallers } from '../../compiler/src/owner-caller-plan.ts'
import {
  captureOwnerManifests,
  InstanceOwnerCallerProject,
  OwnerManifestEpoch,
  readResolvedOwnerManifest,
} from '../../compiler/src/project.ts'
import { prepareTailwindOrder, tailwindPackageDir } from '../../tailwind/src/theme.ts'
import { loadNativeModule } from './native-render.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const names = 'p-[8px] gap-x-[4px] gap-y-[6px] w-[96px] bg-[#112233]'
const caller = (imported = 'Toolbar') => `import {View} from '@hozo/core';
import {${imported} as Tools} from '@hozo/patterns';
export function NativeAnchor(){return <View/>}
export function Caller({items,author}) {
  return <Tools accessibilityLabel="Tools" items={items} style={author.value} className="${names}"/>
}`
const shadow = ownerFixtureShadow('Toolbar.root')
const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const rn = require('react-native')

type Host = { type: string; props: Record<string, unknown> }
type Tree = {
  root: {
    findAll: (predicate: (node: Host) => boolean) => Host[]
    findByType: (type: string) => Host
  }
  update: (element: unknown) => void
  unmount: () => void
}

// React 19's DEV prop-diff logger reads enumerable nested getters during
// updates. Hide only enumeration, not direct authored access, so this counter
// measures the emitted caller rather than renderer instrumentation.
function countedAuthor(get: () => unknown) {
  return Object.defineProperty({} as { readonly value: unknown }, 'value', { get })
}

test('published Toolbar callers preserve the real wrapper, item actions and authored layers on both Native host models', async () => {
  const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.toolbar-owner-'))
  const epoch = new OwnerManifestEpoch()
  const evidence = {
    schema: 1,
    ...evidenceSource(),
    scope: 'native-toolbar-root-host-delivery',
    passed: false,
    audit: 'unknown',
    identity: null as unknown,
    fingerprint: '',
    observations: [] as unknown[],
  }
  let session: InstanceOwnerCallerProject | undefined
  let hook: ReturnType<typeof registerHooks> | undefined
  const previousPlatform = rn.Platform.OS
  try {
    const compiler = createCompiler()
    const cache = openCandidateCache()
    cache.scanFile('Toolbar.tsx', caller(), 1)
    let runtime = ''
    let preparedContexts = 0
    const prepare = compiler.prepareNativeModule.bind(compiler)
    compiler.prepareNativeModule = (...args) => {
      const module = prepare(...args)
      return {
        candidates: module.candidates,
        emit(context) {
          // Observe the context actually consumed by the backend; do not install
          // an independent rank table or recreate the preparation algorithm.
          runtime = cache.renderNativeModulePlan(context).code
          return module.emit(context)
        },
        dispose: () => module.dispose(),
      }
    }
    const packageRoot = realpathSync(path.join(root, 'packages/patterns'))
    const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    const entry = realpathSync(
      path.join(packageRoot, metadata.exports['.']['react-native'].default),
    )
    const edge = { importer: path.join(project, 'Caller.tsx'), specifier: '@hozo/patterns' }
    epoch.adopt(
      captureOwnerManifests(
        [edge],
        [
          readResolvedOwnerManifest(edge, {
            packageRoot,
            entry,
            declaredManifest: metadata.hozo.manifest,
          }),
        ],
        { platform: 'ios', epoch: 'toolbar-test' },
      ),
    )
    const lease = epoch.lease()
    session = new InstanceOwnerCallerProject(lease, compiler, async (candidates) => {
      preparedContexts++
      return JSON.stringify(
        (
          await prepareTailwindOrder(
            '@import "tailwindcss/theme.css";',
            tailwindPackageDir(),
            candidates,
          )
        ).snapshot,
      )
    })
    const input = caller()
    const result = await session.emit(input, {
      ...edge,
      entry,
      imported: 'Toolbar',
      classProp: 'className',
    })
    const alias = await session.emit(caller('HozoToolbar'), {
      ...edge,
      entry,
      imported: 'HozoToolbar',
      classProp: 'className',
    })
    assert.equal(result.identity.owner, 'Toolbar.root')
    evidence.identity = result.identity
    evidence.fingerprint = result.preview.contextFingerprint!
    assert.equal(result.identity.instance, packageRoot)
    assert.equal(alias.identity.owner, result.identity.owner)
    assert.equal(alias.preview.contextFingerprint, result.preview.contextFingerprint)
    assert.equal(preparedContexts, 1)
    for (const current of [result, alias]) {
      assert.equal(current.preview.findings[0]?.disposition, 'prepared-literal')
      assert.match(current.preview.code, /hozoToolbarStyle=/)
      assert.doesNotMatch(current.preview.code, /className=/)
      assert.equal(current.preview.code.split('.create(').length - 1, 1)
      assert.equal(current.preview.code.split('author.value').length - 1, 1)
    }
    assert.ok(runtime)
    const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
    const trace = path.join(path.dirname(sheet), 'trace.js')
    mkdirSync(path.dirname(sheet), { recursive: true })
    writeFileSync(sheet, runtime)
    writeFileSync(
      trace,
      `export * from './candidates.native.js';
import {hozoClasses as resolve} from './candidates.native.js';
export const requests=[];export function hozoClasses(value,state){requests.push(value);return resolve(value,state)}`,
    )
    const traced = pathToFileURL(trace).href
    hook = registerHooks({
      resolve(specifier, context, next) {
        if (specifier === '@hozo/engine/project') return { url: traced, shortCircuit: true }
        const found = next(specifier, context)
        return found.url === pathToFileURL(sheet).href && context.parentURL !== traced
          ? { url: traced, shortCircuit: true }
          : found
      },
    })
    const ordinarySource = `${input}
export {Toolbar as Raw,HozoToolbar as RawAlias} from '@hozo/patterns';
export function Opaque({items,author,names}){return <Tools accessibilityLabel="Tools" items={items} style={author.value} className={names}/>} `
    const ordinary = loadNativeModule(ordinarySource, project, { root: project, compiler })
    const compiled = loadNativeModule(result.preview.code, project, { root: project, compiler })
    const aliased = loadNativeModule(alias.preview.code, project, { root: project, compiler })
    const requests = require(trace).requests as unknown[]
    assert.equal(ordinary.Raw, ordinary.RawAlias)
    assert.throws(
      () =>
        (ordinary.Raw as (props: object) => unknown)({
          items: [],
          className: '',
          hozoToolbarStyle: () => ({}),
        }),
      /must consume className/,
    )
    let observations = 0
    for (const platform of ['android', 'ios']) {
      rn.Platform.OS = platform
      for (const [mode, component] of [
        ['raw', ordinary.Raw],
        ['literal', ordinary.Caller],
        ['opaque', ordinary.Opaque],
        ['prepared', compiled.Caller],
        ['alias', aliased.Caller],
      ] as const) {
        let authorReads = 0
        let presses = 0
        const author = countedAuthor(() => {
          authorReads++
          return [{ gap: 11, paddingTop: 21 }, [false, { rowGap: 5 }]]
        })
        const items = [
          {
            render: (props: object) => {
              assert.deepEqual(props, {}, 'Native item API remains its existing empty wiring')
              return React.createElement(
                'Pressable',
                {
                  onPress: () => {
                    presses++
                  },
                },
                'Action',
              )
            },
          },
        ]
        const props =
          mode === 'raw'
            ? { items, accessibilityLabel: 'Tools', className: names, style: author.value }
            : { items, author, names }
        requests.length = 0
        let tree!: Tree
        renderer.act(() => {
          tree = renderer.create(React.createElement(component, props))
        })
        try {
          const roots = tree.root.findAll(
            (node: Host) => node.type === 'View' && node.props.accessibilityRole === 'toolbar',
          )
          assert.equal(roots.length, 1)
          const owner = roots[0]
          assert.equal(
            tree.root.findAll((node) => node.type === 'View').length,
            2,
            'No additional host around the one item',
          )
          assert.equal(owner.props.accessibilityLabel, 'Tools')
          assert.equal(
            owner.props.hozoToolbarStyle,
            undefined,
            'The private carrier does not leak to RN',
          )
          assert.equal(owner.props.onFocus, undefined)
          assert.equal(owner.props.onHoverIn, undefined)
          const style = rn.StyleSheet.flatten(owner.props.style)
          assert.equal(style.paddingTop, 21)
          assert.equal(style.paddingBottom ?? style.padding, 8)
          assert.equal(style.width, 96)
          assert.equal(style.backgroundColor, '#112233')
          assert.equal(style.rowGap, 5)
          assert.equal(style.columnGap, 11)
          const child = tree.root.findByType('Pressable')
          renderer.act(() => (child.props.onPress as () => void)())
          assert.equal(presses, 1)
          assert.equal(authorReads, 1)
          if (mode === 'prepared' || mode === 'alias')
            assert.ok(
              !requests.includes(names),
              'Prepared literal names do not reach the runtime resolver',
            )
          if (mode === 'raw') assert.ok(requests.includes(names), 'Positive resolver control')
          evidence.observations.push({ platform, mode, phase: 'author', style })
          observations++
          const nextAuthor = countedAuthor(() => {
            authorReads++
            return undefined
          })
          renderer.act(() =>
            tree.update(
              React.createElement(
                component,
                mode === 'raw'
                  ? { ...props, style: undefined }
                  : { items, author: nextAuthor, names },
              ),
            ),
          )
          const retained = tree.root.findAll(
            (node) => node.type === 'View' && node.props.accessibilityRole === 'toolbar',
          )[0]
          assert.equal(retained, owner, 'Removing an author preserves the actual root host')
          const fresh = rn.StyleSheet.flatten(retained.props.style)
          assert.equal(fresh.paddingTop ?? fresh.padding, 8)
          assert.equal(fresh.rowGap, 6)
          assert.equal(fresh.columnGap, 4)
          assert.equal(
            authorReads,
            mode === 'raw' ? 1 : 2,
            `${platform}/${mode}: author access remains once per caller render`,
          )
          evidence.observations.push({ platform, mode, phase: 'removed', style: fresh })
          observations++
        } finally {
          renderer.act(() => tree.unmount())
        }
      }
    }
    assert.equal(observations, 20)
    session.invalidate()
    await assert.rejects(
      () => session!.emit(input, { ...edge, entry, imported: 'Toolbar', classProp: 'className' }),
      /INVALIDATED/,
    )
    evidence.passed = true
  } finally {
    rn.Platform.OS = previousPlatform
    session?.invalidate()
    epoch.invalidate()
    hook?.deregister()
    const destination = path.join(root, 'artifacts/style-fact-model/toolbar-native.json')
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
    rmSync(project, { recursive: true, force: true })
  }
})

test('Toolbar shadow preparation retains unavailable interaction and ambiguous authored sites', () => {
  const compiler = createCompiler()
  const options = { source: '@hozo/patterns', imported: 'Toolbar', shadow }
  for (const input of [
    caller().replace(names, 'p-[8px] hover:opacity-50'),
    caller().replace(`className="${names}"`, 'className={runtimeNames}'),
    caller().replace(`className="${names}"`, `className="${names}" {...rest}`),
    caller().replace(`className="${names}"`, `className="${names}" hozoToolbarStyle={other}`),
  ]) {
    const output = previewOwnerLiteralCallers(input, compiler, options)
    assert.equal(output.code, input)
    assert.equal(output.findings[0]?.disposition, 'retained')
  }
})
