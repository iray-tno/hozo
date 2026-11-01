// One finite batch and real component delivery, not a production adapter rollout.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, type PreparedTailwindContext } from '@hozo/compiler'
import { emitFinalTailwindBatch } from '@hozo/compiler/project'
import { prepareTailwindOrder, tailwindPackageDir } from '@hozo/tailwind'
import { ownerFixtureShadow } from '../../../scripts/style-slots/owner-fixture.mjs'
import { prepareOwnerLiteralCallers } from '../../compiler/src/owner-caller-plan.ts'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const rn = require('react-native')
const shadow = ownerFixtureShadow('BottomSheet.handle')
const options = { source: '@hozo/patterns', imported: 'BottomSheet', shadow }
const cases = [
  'p-4 p-2 w-8 w-4 bg-[#112233] bg-[#223344]',
  'p-2 p-4 w-4 w-8 bg-[#223344] bg-[#112233]',
]
const caller = (
  classes: string,
) => `import {BottomSheet} from '@hozo/patterns'; import {View} from '@hozo/core';
export function App({open,detents,author}) {return <BottomSheet open={open} detents={detents} handleClassName="${classes}" handleStyle={author.value}>Body</BottomSheet>}
export function Opaque({open,detents,author,names}) {return <BottomSheet open={open} detents={detents} handleClassName={names} handleStyle={author.value}>Body</BottomSheet>}
export const Sentinel=()=> <View/>;`
const primitive = (classes: string) =>
  `import {View} from '@hozo/core'; export const Reference=()=> <View className="${classes}"/>`

test('collected callers, ordinary static output and actual owner fallback use one final Tailwind context for conflicting literals', async (t) => {
  const compiler = createCompiler()
  const contexts: PreparedTailwindContext[] = []
  let parses = 0
  const prepareNative = compiler.prepareNativeModule.bind(compiler)
  t.mock.method(compiler, 'prepareNativeModule', (...args) => {
    parses++
    const module = prepareNative(...args)
    return {
      candidates: module.candidates,
      emit(context) {
        contexts.push(context)
        return module.emit(context)
      },
      dispose: () => module.dispose(),
    }
  })
  // Every subject is selected explicitly; no manifest/export trust is implied.
  const owners = cases.map((classes) =>
    prepareOwnerLiteralCallers(caller(classes), compiler, options),
  )
  const natives = cases.map((classes) => compiler.prepareNativeModule(primitive(classes)))
  const webs = cases.map((classes) => compiler.prepareWebModule(primitive(classes)))
  assert.equal(parses, 6, 'two owner shapes and one independent static parse per case')
  assert.equal(contexts.length, 0)
  const staticOnly = compiler.prepareNativeModule(primitive('p-8'))
  const cache = openCandidateCache()
  cache.scanFile('opaque', JSON.stringify(cases), 0)
  const row = { id: 'opaque', revision: 'one', record: cache.exportFile('opaque')! }
  const collected = [
    ...owners.map((module, i) => ({ id: `owner-${i}`, revision: 'one', module })),
    ...natives.map((module, i) => ({ id: `native-${i}`, revision: 'one', module })),
    ...webs.map((module, i) => ({ id: `web-${i}`, revision: 'one', module })),
    { id: 'static-only', revision: 'one', module: staticOnly },
  ]
  const noDirect = t.mock.method(compiler, 'compileNativeModule', () => {
    throw new Error('no direct fallback')
  })
  t.mock.method(compiler, 'setTailwindOrder', () => {
    throw new Error('no global setter')
  })
  let preparations = 0
  const batch = await emitFinalTailwindBatch({
    expected: collected,
    collected,
    runtime: { expected: [row], contributions: [row] },
    async prepare(names) {
      preparations++
      assert.ok(Object.isFrozen(names))
      assert.ok(names.includes('p-8'), 'static-only units join the same universe')
      return JSON.stringify(
        (
          await prepareTailwindOrder(
            '@import "tailwindcss/theme.css";',
            tailwindPackageDir(),
            names,
          )
        ).snapshot,
      )
    },
  })
  noDirect.mock.restore()
  assert.equal(preparations, 1)
  assert.equal(contexts.length, 7)
  assert.ok(
    contexts.every((context) => context === contexts[0]),
    'exact context handle, not only equal fingerprints',
  )
  assert.equal(batch.native.fingerprint, batch.fingerprint)
  assert.ok(batch.native.entries.length > 0, 'opaque control must really have prepared entries')
  assert.ok(
    !batch.native.entries.some((entry) => entry.candidate === 'p-8'),
    'static-only input does not leak into runtime membership',
  )

  const project = mkdtempSync(fileURLToPath(new URL('../.owner-final-', import.meta.url)))
  t.after(() => rmSync(project, { recursive: true, force: true }))
  const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
  const traced = path.join(path.dirname(sheet), 'traced.js')
  mkdirSync(path.dirname(sheet), { recursive: true })
  writeFileSync(sheet, batch.native.code)
  writeFileSync(
    traced,
    `export * from './candidates.native.js';
import {hozoClasses as resolve} from './candidates.native.js'; export const requested=[];
export function hozoClasses(value,state){requested.push(value);return resolve(value,state)}`,
  )
  const hook = registerHooks({
    resolve(specifier, context, next) {
      const url = pathToFileURL(traced).href
      if (specifier === '@hozo/engine/project') return { url, shortCircuit: true }
      const resolved = next(specifier, context)
      return resolved.url === pathToFileURL(sheet).href && context.parentURL !== url
        ? { url, shortCircuit: true }
        : resolved
    },
  })
  t.after(() => hook.deregister())
  t.mock.method(console, 'warn', () => {})
  const requested = (require(traced) as { requested: unknown[] }).requested
  for (const [index, classes] of cases.entries()) {
    const output = batch.modules.find(({ id }) => id === `owner-${index}`)!.output
    assert.ok('findings' in output)
    assert.equal(output.scope, 'explicit-collected-compiler-preview')
    assert.equal(output.contextFingerprint, batch.fingerprint)
    assert.equal(output.findings[0]!.disposition, 'prepared-literal')
    assert.equal(output.findings[1]!.reason, 'nonliteral')
    const native = batch.modules.find(({ id }) => id === `native-${index}`)!.output
    assert.ok('components' in native)
    const staticStyles = runInNewContext(`(${native.components[0]!.styles})`).hozo0
    assert.equal(staticStyles.paddingTop, 16)
    assert.equal(staticStyles.width, 32)
    assert.equal(staticStyles.backgroundColor, '#223344')
    const web = batch.modules.find(({ id }) => id === `web-${index}`)!.output
    assert.ok(Array.isArray(web))
    assert.match(web[0]!.css, /padding-top: 16px/)
    assert.match(web[0]!.css, /width: 32px/)
    assert.match(web[0]!.css, /background-color: #223344/)
    // The direct/legacy comparator disagrees in at least one dimension in each
    // case. If the final-context connection vanished, this must not stay green.
    const direct = compiler.compileNativeModule(primitive(classes)).components[0]!
    assert.notEqual(direct.styles, native.components[0]!.styles)
    const exports = loadNativeModule(output.code, project, { root: project, compiler })
    for (const resizable of [false, true]) {
      let own: Record<string, unknown> | undefined = Object.freeze({ paddingTop: 5, width: 41 })
      let reads = 0
      const author = {
        get value() {
          reads++
          return own
        },
      }
      const props = { open: true, detents: resizable ? [0.5, 1] : [1], author }
      let prepared: Rendered | undefined, opaque: Rendered | undefined
      try {
        requested.length = 0
        renderer.act(() => {
          prepared = renderer.create(React.createElement(exports.App, props))
        })
        const owner = handle(prepared, resizable)
        assert.equal(style(owner).paddingTop, 5)
        assert.equal(style(owner).width, 41)
        assert.equal(reads, 1)
        if (resizable) {
          assert.equal(typeof owner.props.onHoverIn, 'function')
          renderer.act(() => (owner.props.onHoverIn as (event: object) => void)({}))
          assert.equal(handle(prepared, true), owner)
          assert.equal(style(owner).width, 41)
          assert.equal(reads, 1, 'owner state changes must not re-read the caller author')
        }
        own = undefined
        renderer.act(() => prepared!.update(React.createElement(exports.App, props)))
        assert.equal(handle(prepared, resizable), owner)
        assert.equal(reads, 2)
        assert.equal(style(owner).paddingTop, staticStyles.paddingTop)
        assert.equal(style(owner).width, staticStyles.width)
        assert.equal(style(owner).backgroundColor, staticStyles.backgroundColor)
        assert.ok(
          !requested.includes(classes),
          'prepared mount/update must not resolve its literal',
        )
        renderer.act(() => {
          opaque = renderer.create(
            React.createElement(exports.Opaque, { ...props, names: classes }),
          )
        })
        const opaqueStyle = style(handle(opaque, resizable))
        assert.ok(
          requested.includes(classes),
          `opaque control must really resolve the same literal: ${JSON.stringify({ index, resizable, requested })}`,
        )
        assert.deepEqual(style(owner), opaqueStyle)
      } finally {
        renderer.act(() => {
          prepared?.unmount()
          opaque?.unmount()
        })
      }
    }
  }
})

type Host = { type: unknown; props: Record<string, unknown> }
type Rendered = {
  root: { findAll: (predicate: (node: Host) => boolean) => Host[] }
  update(element: unknown): void
  unmount(): void
}
function handle(tree: Rendered | undefined, resizable: boolean): Host {
  assert.ok(tree)
  const owners = tree.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      (resizable
        ? node.type === 'Pressable' && node.props.accessibilityRole === 'button'
        : node.type === 'View' &&
          node.props.importantForAccessibility === 'no-hide-descendants' &&
          node.props.onMoveShouldSetResponder !== undefined),
  )
  assert.equal(owners.length, 1, 'actual handle, not a scrim or empty tree')
  return owners[0]!
}
function style(owner: Host): Record<string, unknown> {
  return rn.StyleSheet.flatten(
    typeof owner.props.style === 'function'
      ? owner.props.style({ pressed: false })
      : owner.props.style,
  )
}

test('unassessed owner state keeps the public class even in a completed final batch', async () => {
  const compiler = createCompiler()
  const source = caller('p-2 hover:opacity-50')
  const module = prepareOwnerLiteralCallers(source, compiler, options)
  const batch = await emitFinalTailwindBatch({
    expected: [{ id: 'owner', revision: 'one' }],
    collected: [{ id: 'owner', revision: 'one', module }],
    runtime: { expected: [], contributions: [] },
    prepare: async (names) =>
      JSON.stringify(
        (
          await prepareTailwindOrder(
            '@import "tailwindcss/theme.css";',
            tailwindPackageDir(),
            names,
          )
        ).snapshot,
      ),
  })
  const output = batch.modules[0]!.output
  assert.equal(output.code, source)
  assert.equal(output.findings[0]!.reason, 'shape-unassessed')
  assert.ok(output.findings[0]!.notes.length > 0)
  assert.equal(output.findings[1]!.reason, 'nonliteral')
  assert.equal(output.contextFingerprint, batch.fingerprint)
})

test('publisher failure or epoch cancellation consumes the composite without returning partial caller code', async () => {
  for (const stage of ['stylesheet', 'cancel']) {
    const module = prepareOwnerLiteralCallers(caller(cases[0]!), createCompiler(), options)
    const controller = new AbortController()
    const reason = new Error(stage)
    await assert.rejects(
      emitFinalTailwindBatch({
        expected: [{ id: 'owner', revision: 'one' }],
        collected: [{ id: 'owner', revision: 'one', module }],
        runtime: { expected: [], contributions: [] },
        signal: controller.signal,
        async prepare() {
          if (stage === 'stylesheet') throw reason
          controller.abort(reason)
          return ''
        },
      }),
      (error) => error === reason,
    )
    assert.throws(() => module.emit({} as never), /already been emitted or disposed/)
    module.dispose()
  }
})
