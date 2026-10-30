// First RFC010 spike slice: a real owner consumes styles prepared by the
// existing primitive lowering. This fixture producer is NOT a generalized
// compiler/manifest implementation and adds no component to Primitive.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, mock, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { parseOwnerContractShadow, selectOwnerShape } from '../../compiler/src/owner-contract.ts'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const rn = require('react-native')
const classes =
  'p-[8px] opacity-100 bg-[#ffffff] hover:opacity-50 focus:p-[12px] active:bg-[#ff0000]'
const restClasses = 'p-[8px] opacity-100 bg-[#ffffff]'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.handle-spike-'))
const compiler = createCompiler()
const source = `
import {View, Pressable} from '@hozo/core'
import {BottomSheet} from '@hozo/patterns'
export {BottomSheet as Raw} from '@hozo/patterns'
export function InteractivePlan({extra}) {
  return <Pressable className={\`${classes} \${extra ?? ''}\`} />
}
export function DecorativePlan({extra}) {
  return <View className={\`${restClasses} \${extra ?? ''}\`} />
}
export function Prepared({base,own,extra,observe}) {
  // Capture the residual once during caller rendering, not on every event.
  const captured = extra
  const prepared = (state) => {
    observe?.(state)
    const element = state === undefined
      ? DecorativePlan({extra:captured}) : InteractivePlan({extra:captured})
    const style = element.props.style
    return typeof style === 'function' ? style(state) : style
  }
  return <BottomSheet {...base} handleStyle={own} hozoHandleStyle={prepared} />
}
export function Opaque({base,own,names}) {
  return <BottomSheet {...base} handleStyle={own} handleClassName={names} />
}
export function ReadCaller({input,...props}) {
  return <Prepared {...props} extra={input.value}/>
}
`
const cache = openCandidateCache()
cache.scanFile(
  'HandleChoices.ts',
  JSON.stringify([...classes.split(' '), 'rounded-[7px]', 'rounded-[9px]']),
  1,
)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule())
const tracedSheet = path.join(path.dirname(sheet), 'traced.js')
writeFileSync(
  tracedSheet,
  `export * from './candidates.native.js';
import {hozoClasses as resolve} from './candidates.native.js';
export const requested=[];
export function hozoClasses(value,state){requested.push(value);return resolve(value,state)}
`,
)
const hook = registerHooks({
  resolve(specifier, context, next) {
    const traced = pathToFileURL(tracedSheet).href
    if (specifier === '@hozo/engine/project') return { url: traced, shortCircuit: true }
    const resolved = next(specifier, context)
    return resolved.url === pathToFileURL(sheet).href && context.parentURL !== traced
      ? { url: traced, shortCircuit: true }
      : resolved
  },
})
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})
const warnings = mock.method(console, 'warn', () => {})
const exports = loadNativeModule(source, project, { root: project, compiler })
warnings.mock.restore()
const requests = (require(tracedSheet) as { requested: unknown[] }).requested
const contract = parseOwnerContractShadow(
  readFileSync(new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url), 'utf8'),
).contracts[0]!

type Host = { type: unknown; props: Record<string, unknown> }
type Rendered = {
  root: { findAll: (predicate: (node: Host) => boolean) => Host[] }
  update: (element: unknown) => void
  unmount: () => void
}
function render(type: unknown, props: Record<string, unknown>): Rendered {
  let tree!: Rendered
  renderer.act(() => {
    tree = renderer.create(React.createElement(type, props))
  })
  return tree
}
function handle(tree: Rendered, resizable: boolean) {
  const found = tree.root.findAll(
    (node: Host) =>
      typeof node.type === 'string' &&
      (resizable
        ? node.type === 'Pressable' && node.props.accessibilityRole === 'button'
        : node.type === 'View' &&
          node.props.importantForAccessibility === 'no-hide-descendants' &&
          node.props.onMoveShouldSetResponder !== undefined),
  )
  assert.equal(found.length, 1, 'require the actual handle, not an absent/scrim host')
  return found[0]
}
function style(node: Host): Record<string, unknown> {
  return rn.StyleSheet.flatten(
    typeof node.props.style === 'function'
      ? node.props.style({ pressed: false })
      : node.props.style,
  )
}
function unmount(tree: Rendered) {
  renderer.act(() => tree.unmount())
}

test('the ordinary compiler still carries BottomSheet; the producer really compiles its plans', () => {
  const ordinary = compiler.compileNativeModule(
    `import {BottomSheet} from '@hozo/patterns'; export function X(){return <BottomSheet handleClassName="p-2"/>}`,
  )
  assert.equal(ordinary.components.length, 0)
  const plans = compiler.compileNativeModule(source)
  assert.equal(plans.components.length, 2)
  assert.ok(plans.components[0].jsx.includes('style={({'))
  assert.deepEqual(
    plans.components.flatMap((plan) => plan.diagnostics.map((d) => [d.code, d.severity])),
    [
      ['DYNAMIC_CLASS_NAME_NOT_RESOLVED', 'warning'],
      ['DYNAMIC_CLASS_NAME_NOT_RESOLVED', 'warning'],
    ],
  )
  const refused = compiler.compileNativeModule(
    `import {View} from '@hozo/core'; export function Decoration(){return <View className="${classes}"/>}`,
  )
  assert.equal(
    refused.components[0].diagnostics.filter((d) => d.code === 'NOT_WIRED_ON_NATIVE').length,
    3,
  )
  assert.throws(
    () =>
      loadNativeModule(
        `import {View} from '@hozo/core'; export function Decoration(){return <View className="${classes}"/>}`,
        project,
        { root: project, compiler },
      ),
    /NOT_WIRED_ON_NATIVE/,
  )
  assert.ok(!plans.components[1].jsx.includes('hovered &&'))
})

test('prepared and opaque plans reach the real two-shape handle, preserving author precedence', () => {
  const warn = mock.method(console, 'warn', () => {})
  try {
    for (const resizable of [false, true])
      for (const author of [
        undefined,
        Object.freeze({ opacity: 0.25, gap: 16 }),
        Object.freeze([Object.freeze({ gap: 24 }), Object.freeze({ rowGap: 6 })]),
      ]) {
        const base = { open: true, detents: resizable ? [0.5, 1] : [1], children: 'Body' }
        const prepared = render(exports.Prepared, { base, own: author, extra: 'rounded-[7px]' })
        const opaque = render(exports.Opaque, {
          base,
          own: author,
          names: `${resizable ? classes : restClasses} rounded-[7px]`,
        })
        const events = resizable
          ? ['onHoverIn', 'onFocus', 'onPressIn', 'onPressOut', 'onBlur', 'onHoverOut']
          : []
        let padding = 8
        let opacity = 1
        let background = '#ffffff'
        const preparedHost = handle(prepared, resizable)
        const compare = () => {
          const p = handle(prepared, resizable)
          const o = handle(opaque, resizable)
          assert.deepEqual(style(p), style(o))
          assert.equal(style(p).borderRadius, 7)
          assert.equal(style(p).paddingTop, padding)
          assert.equal(style(p).opacity, author && !Array.isArray(author) ? 0.25 : opacity)
          assert.equal(style(p).backgroundColor, background)
          assert.equal(p, preparedHost, 'state updates preserve the actual host identity')
          assert.equal(p.props.accessibilityRole, resizable ? 'button' : undefined)
          const signature = (tree: Rendered) =>
            tree.root
              .findAll((node) => typeof node.type === 'string')
              .map((node) => [
                node.type,
                node.props.accessibilityRole,
                node.props.accessibilityElementsHidden,
                node.props.importantForAccessibility,
              ])
          assert.deepEqual(
            signature(prepared),
            signature(opaque),
            'no extra host or changed a11y grouping',
          )
          assert.ok(
            prepared.root
              .findAll((node) => typeof node.type === 'string')
              .every((node) => node.props.hozoHandleStyle === undefined),
          )
          if (author) assert.equal(style(p).rowGap, Array.isArray(author) ? 6 : 16)
          if (author) assert.equal(style(p).columnGap, Array.isArray(author) ? 24 : 16)
        }
        compare()
        for (const event of events) {
          if (event === 'onHoverIn') opacity = 0.5
          if (event === 'onHoverOut') opacity = 1
          if (event === 'onFocus') padding = 12
          if (event === 'onBlur') padding = 8
          if (event === 'onPressIn') background = '#ff0000'
          if (event === 'onPressOut') background = '#ffffff'
          renderer.act(() => {
            ;(handle(prepared, resizable).props[event] as (event: object) => void)({})
            ;(handle(opaque, resizable).props[event] as (event: object) => void)({})
          })
          compare()
        }
        unmount(prepared)
        unmount(opaque)
      }
  } finally {
    warn.mock.restore()
  }
})

test('one prepared callback evaluation reads one frozen author and retains real activation/dismissal', () => {
  let reads = 0
  let gap = 16
  let closes = 0
  const own = Object.freeze({
    get gap() {
      reads++
      return gap
    },
  })
  const tree = render(exports.Prepared, {
    base: { open: true, detents: [0.5, 1], children: 'Body', onClose: () => closes++ },
    own,
  })
  assert.equal(
    reads,
    0,
    'the real pressable style is evaluated by its host, not eagerly by the wrapper',
  )
  assert.equal(style(handle(tree, true)).rowGap, 16)
  assert.equal(reads, 1)
  gap = 24
  renderer.act(() => (handle(tree, true).props.onHoverIn as (e: object) => void)({}))
  assert.equal(style(handle(tree, true)).rowGap, 24)
  assert.equal(reads, 2)
  const panels = tree.root.findAll(
    (node) => typeof node.type === 'string' && typeof node.props.onLayout === 'function',
  )
  assert.equal(panels.length, 1)
  renderer.act(() =>
    (panels[0].props.onLayout as (e: object) => void)({ nativeEvent: { layout: { height: 100 } } }),
  )
  const translation = () =>
    (rn.StyleSheet.flatten(panels[0].props.style).transform as { translateY: number }[])[0]
      .translateY
  assert.equal(translation(), 0)
  renderer.act(() => (handle(tree, true).props.onPress as () => void)())
  assert.equal(translation(), 50)
  renderer.act(() => (handle(tree, true).props.onPress as () => void)())
  assert.equal(translation(), 0)
  renderer.act(() =>
    (panels[0].props.onAccessibilityAction as (e: object) => void)({
      nativeEvent: { actionName: 'escape' },
    }),
  )
  assert.equal(closes, 1)
  const modals = tree.root.findAll((node) => node.type === 'Modal')
  assert.equal(modals.length, 1)
  renderer.act(() => (modals[0].props.onRequestClose as () => void)())
  assert.equal(closes, 2)
  unmount(tree)
})

test('compiled literal portions never return to the candidate resolver; only residuals do', () => {
  for (const resizable of [false, true]) {
    let reads = 0
    const input = Object.freeze({
      get value() {
        reads++
        return 'rounded-[7px]'
      },
    })
    requests.length = 0
    const base = { open: true, detents: resizable ? [0.5, 1] : [1], children: 'Body' }
    const tree = render(exports.ReadCaller, {
      base,
      input,
    })
    style(handle(tree, resizable))
    if (resizable) {
      renderer.act(() => (handle(tree, true).props.onHoverIn as (e: object) => void)({}))
      style(handle(tree, true))
    }
    assert.equal(reads, 1)
    const values = requests.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
    assert.ok(values.length > 0)
    assert.ok(
      values.every((value) => value === 'rounded-[7px]'),
      JSON.stringify(values),
    )
    const originalHost = handle(tree, resizable)
    renderer.act(() =>
      tree.update(
        React.createElement(exports.ReadCaller, { base, input: { value: 'rounded-[9px]' } }),
      ),
    )
    assert.equal(style(handle(tree, resizable)).borderRadius, 9)
    assert.equal(handle(tree, resizable), originalHost)
    renderer.act(() =>
      tree.update(React.createElement(exports.ReadCaller, { base, input: { value: '' } })),
    )
    assert.equal(style(handle(tree, resizable)).borderRadius, undefined)
    assert.equal(handle(tree, resizable), originalHost)
    unmount(tree)
  }
})

test('the real opaque decoration keeps its missing-state warning instead of borrowing handle events', () => {
  const warn = mock.method(console, 'warn', () => {})
  let tree: Rendered | undefined
  try {
    tree = render(exports.Opaque, {
      base: { open: true, detents: [1], children: 'Body' },
      names: classes,
    })
    assert.equal(style(handle(tree, false)).opacity, 1)
    assert.ok(
      warn.mock.calls.some((call) =>
        call.arguments.some((arg) => String(arg).includes('hands its classes no state')),
      ),
    )
  } finally {
    if (tree) unmount(tree)
    warn.mock.restore()
  }
})

test('prepared evaluation is gated and receives no invented decoration events', () => {
  assert.equal(contract.audit, 'unknown')
  assert.equal(contract.abi.nativePreparedProp, 'hozoHandleStyle')
  assert.equal(contract.shapes[1].nativeHost, 'View')
  assert.deepEqual(contract.shapes[1].events, [])
  const seen: unknown[] = []
  const base = { open: false, detents: [1], children: 'Body' }
  assert.equal(selectOwnerShape(contract, { open: false }).status, 'absent')
  const tree = render(exports.Prepared, { base, observe: (state: unknown) => seen.push(state) })
  assert.deepEqual(seen, [])
  renderer.act(() =>
    tree.update(
      React.createElement(exports.Prepared, {
        base: { ...base, open: true },
        observe: (state: unknown) => seen.push(state),
      }),
    ),
  )
  assert.ok(seen.length > 0)
  assert.ok(seen.every((state) => state === undefined))
  const decorative = selectOwnerShape(contract, { open: true, resizable: false })
  assert.equal(decorative.status, 'selected')
  if (decorative.status === 'selected') {
    assert.equal(decorative.shape.nativeHost, handle(tree, false).type)
    assert.deepEqual(decorative.shape.events, [])
  }
  seen.length = 0
  renderer.act(() =>
    tree.update(
      React.createElement(exports.Prepared, {
        base: { ...base, open: true, detents: [0.5, 1] },
        observe: (state: unknown) => seen.push(state),
      }),
    ),
  )
  style(handle(tree, true))
  assert.equal(contract.shapes[0].nativeHost, 'Pressable')
  const interactive = selectOwnerShape(contract, { open: true, resizable: true })
  assert.equal(interactive.status, 'selected')
  if (interactive.status === 'selected')
    assert.equal(interactive.shape.nativeHost, handle(tree, true).type)
  for (const event of contract.shapes[0].events)
    assert.ok(seen.some((state) => state && typeof state === 'object' && event in state))
  assert.ok(seen.some((state) => state && typeof state === 'object' && 'hovered' in state))
  seen.length = 0
  renderer.act(() =>
    tree.update(
      React.createElement(exports.Prepared, {
        base,
        observe: (state: unknown) => seen.push(state),
      }),
    ),
  )
  assert.deepEqual(seen, [])
  unmount(tree)
})

test('the private prepared route refuses double application instead of losing the public class', () => {
  const error = mock.method(console, 'error', () => {})
  try {
    assert.throws(
      () =>
        render(exports.Raw, { open: true, handleClassName: 'p-2', hozoHandleStyle: () => ({}) }),
      /must consume handleClassName/,
    )
  } finally {
    error.mock.restore()
  }
})
