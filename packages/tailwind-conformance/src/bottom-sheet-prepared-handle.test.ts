// RFC010: direct styles from the existing backend reach a real owner.
// Caller wiring remains an explicit fixture, not generalized manifest lowering.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, mock, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { previewOwnerLiteralCallers } from '../../compiler/src/owner-caller-plan.ts'
import { parseOwnerContractShadow, selectOwnerShape } from '../../compiler/src/owner-contract.ts'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const classes =
  'p-[8px] opacity-100 bg-[#ffffff] hover:opacity-50 focus:p-[12px] active:bg-[#ff0000]'
const restClasses = 'p-[8px] opacity-100 bg-[#ffffff]'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.handle-spike-'))
const compiler = createCompiler()
const contract = parseOwnerContractShadow(
  readFileSync(new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url), 'utf8'),
).contracts[0]!
const planSource = `
import {View, Pressable} from '@hozo/core'
export function InteractivePlan({extra}) {
  return <${contract.shapes[0]!.nativeHost} className={\`${classes} \${extra}\`} />
}
export function DecorativePlan({extra}) {
  return <${contract.shapes[1]!.nativeHost} className={\`${restClasses} \${extra}\`} />
}
`
const preparedPlans = compiler.compileNativeModule(planSource, undefined, undefined, {
  ownerStyle: true,
})
const declarations = preparedPlans.components
  .map((plan, index) => {
    const carrier = plan.ownerStyle
    assert.ok(carrier, JSON.stringify(plan.diagnostics))
    assert.ok(!plan.diagnostics.some((d) => d.severity === 'error'))
    if (carrier.focusVisible) assert.ok(contract.shapes[index]!.events.includes('focusVisible'))
    const name = index === 0 ? 'DirectInteractivePlan' : 'DirectDecorativePlan'
    // Hoist each StyleSheet once. The backend's expression is emitted verbatim,
    // not interpreted or obtained by constructing an unmounted React element.
    return `export const ${name} = ((hozoStyles) => (extra) => (${carrier.expression}))(PreparedStyleSheet.create(${plan.styles}));`
  })
  .join('\n')
const source = `
import {StyleSheet as PreparedStyleSheet} from 'react-native'
import {hozoClasses} from '@hozo/engine/project'
import {BottomSheet} from '@hozo/patterns'
export {BottomSheet as Raw} from '@hozo/patterns'
${planSource}
${declarations}
export function Prepared({base,own,extra,observe}) {
  // Capture the residual once during caller rendering, not on every event.
  const captured = extra
  const interactive = DirectInteractivePlan(captured)
  const prepared = (state) => {
    observe?.(state)
    return state === undefined ? DirectDecorativePlan(captured) : interactive(state)
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
  JSON.stringify([...classes.split(' '), 'rounded-[7px]', 'rounded-[9px]', 'gap-x-2']),
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
    if (specifier === 'react-native')
      return { url: new URL('./handle-modal-model.js', import.meta.url).href, shortCircuit: true }
    const traced = pathToFileURL(tracedSheet).href
    if (specifier === '@hozo/engine/project') return { url: traced, shortCircuit: true }
    const resolved = next(specifier, context)
    return resolved.url === pathToFileURL(sheet).href && context.parentURL !== traced
      ? { url: traced, shortCircuit: true }
      : resolved
  },
})
const rn = require('react-native')
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})
const warnings = mock.method(console, 'warn', () => {})
const exports = loadNativeModule(source, project, { root: project, compiler })
warnings.mock.restore()
const literalClasses = `${restClasses} gap-x-2`
const literalSource = `${planSource}
import {BottomSheet} from '@hozo/patterns';
export function LiteralCaller({open,detents,author}) {
  return <BottomSheet open={open} detents={detents} handleStyle={author.value} handleClassName="${literalClasses}">Body</BottomSheet>
}`
const literalPreview = previewOwnerLiteralCallers(literalSource, compiler, {
  source: '@hozo/patterns',
  imported: 'BottomSheet',
  shadow: readFileSync(
    new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
    'utf8',
  ),
})
assert.equal(literalPreview.findings[0]!.disposition, 'prepared-literal')
const literalWarnings = mock.method(console, 'warn', () => {})
const literalOrdinary = loadNativeModule(literalSource, project, { root: project, compiler })
const literalPrepared = loadNativeModule(literalPreview.code, project, { root: project, compiler })
literalWarnings.mock.restore()
const requests = (require(tracedSheet) as { requested: unknown[] }).requested

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

test('direct compiler carriers return styles, not temporary React elements', () => {
  const callback = (exports.DirectInteractivePlan as (extra: string) => (state: object) => unknown)(
    'rounded-[7px]',
  )
  const state = { pressed: false, hovered: true, focused: false, focusVisible: false }
  const output = callback(state)
  assert.equal(React.isValidElement(output), false)
  assert.equal(rn.StyleSheet.flatten(output).opacity, 0.5)
  assert.equal(rn.StyleSheet.flatten(output).borderRadius, 7)
  assert.equal(preparedPlans.components[0]!.ownerStyle!.callback, true)
  assert.equal(preparedPlans.components[0]!.ownerStyle!.focusVisible, true)
  assert.equal(preparedPlans.components[1]!.ownerStyle!.callback, false)
  const ordinary = compiler.compileNativeModule(planSource)
  for (let index = 0; index < ordinary.components.length; index++) {
    const { ownerStyle, ...direct } = preparedPlans.components[index]!
    assert.ok(ownerStyle)
    const { ownerStyle: absent, ...reference } = ordinary.components[index]!
    assert.ok(absent == null)
    assert.deepEqual(direct, reference, 'ordinary emitted output remains the independent reference')
  }
})

test('literal caller preview reaches both real owners without resolving the literal or caching its author', () => {
  for (const resizable of [false, true]) {
    let own: Record<string, unknown> | undefined = Object.freeze({ gap: 16, opacity: 0.25 })
    let ordinaryReads = 0
    let preparedReads = 0
    const beforeAuthor = {
      get value() {
        ordinaryReads++
        return own
      },
    }
    const afterAuthor = {
      get value() {
        preparedReads++
        return own
      },
    }
    const props = { open: true, detents: resizable ? [0.5, 1] : [1] }
    requests.length = 0
    const ordinary = render(literalOrdinary.LiteralCaller, { ...props, author: beforeAuthor })
    let prepared: Rendered | undefined
    try {
      const expected = style(handle(ordinary, resizable))
      assert.ok(
        requests.some((value) => value === literalClasses),
        'independent opaque route must witness actual literal resolution',
      )
      requests.length = 0
      prepared = render(literalPrepared.LiteralCaller, { ...props, author: afterAuthor })
      const owner = handle(prepared, resizable)
      assert.deepEqual(style(owner), expected)
      assert.equal(style(owner).paddingTop, 8)
      assert.equal(style(owner).opacity, 0.25)
      assert.equal(style(owner).columnGap, 16)
      assert.equal(style(owner).rowGap, 16)
      assert.equal(ordinaryReads, 1)
      assert.equal(preparedReads, 1)
      if (resizable) {
        renderer.act(() => (owner.props.onHoverIn as (e: object) => void)({}))
        assert.equal(handle(prepared, true), owner)
        assert.deepEqual(style(owner), expected)
        assert.equal(preparedReads, 1)
      }
      own = Object.freeze({ gap: 24, columnGap: 6, opacity: 0.75 })
      renderer.act(() => {
        prepared!.update(
          React.createElement(literalPrepared.LiteralCaller, { ...props, author: afterAuthor }),
        )
      })
      assert.equal(handle(prepared, resizable), owner)
      assert.equal(style(owner).columnGap, 6)
      assert.equal(style(owner).rowGap, 24)
      assert.equal(preparedReads, 2)
      assert.deepEqual(
        requests.filter((value) => typeof value === 'string' && value.length),
        [],
        'prepared mount, events and author updates must not resolve literal classes',
      )
      renderer.act(() =>
        ordinary.update(
          React.createElement(literalOrdinary.LiteralCaller, { ...props, author: beforeAuthor }),
        ),
      )
      assert.deepEqual(style(owner), style(handle(ordinary, resizable)))
      assert.deepEqual(
        requests.filter((value) => typeof value === 'string' && value.length),
        [literalClasses],
        'only the updated opaque control may resolve literal classes',
      )
      requests.length = 0
      own = undefined
      renderer.act(() =>
        prepared!.update(
          React.createElement(literalPrepared.LiteralCaller, { ...props, author: afterAuthor }),
        ),
      )
      assert.equal(handle(prepared, resizable), owner)
      assert.equal(style(owner).opacity, 1)
      assert.equal(style(owner).columnGap, 8)
      assert.equal(preparedReads, 3)
      assert.deepEqual(
        requests.filter((value) => typeof value === 'string' && value.length),
        [],
      )
      renderer.act(() =>
        ordinary.update(
          React.createElement(literalOrdinary.LiteralCaller, { ...props, author: beforeAuthor }),
        ),
      )
      assert.deepEqual(style(owner), style(handle(ordinary, resizable)))
    } finally {
      unmount(ordinary)
      if (prepared) unmount(prepared)
    }
  }
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
  assert.equal(selectOwnerShape(contract, { present: false }).status, 'absent')
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
  const decorative = selectOwnerShape(contract, { present: true, resizable: false })
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
  const interactive = selectOwnerShape(contract, { present: true, resizable: true })
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

test('initially hidden handles never evaluate author styles under either Modal lifetime model', () => {
  for (const platform of ['android', 'ios'])
    for (const resizable of [false, true])
      for (const type of [exports.Prepared, exports.Opaque]) {
        rn.handleModalModel.platform = platform
        let reads = 0
        const own = Object.freeze({
          get gap() {
            reads++
            return 16
          },
        })
        const tree = render(type, {
          base: { open: false, detents: resizable ? [0.5, 1] : [1] },
          own,
          names: restClasses,
          extra: '',
        })
        try {
          assert.equal(
            reads,
            0,
            `${platform}/${resizable}: hidden owner normalized an author before its Modal rendered it`,
          )
          assert.equal(tree.root.findAll((node) => node.type === 'Modal').length, 0)
        } finally {
          unmount(tree)
          rn.handleModalModel.platform = 'android'
        }
      }
})

test('iOS dismissing handles keep prepared and authored styles until the actual owner unmounts', () => {
  rn.handleModalModel.platform = 'ios'
  try {
    for (const resizable of [false, true]) {
      const base = { open: true, detents: resizable ? [0.5, 1] : [1] }
      const props = { base, own: Object.freeze({ gap: 16 }), extra: '', names: restClasses }
      const prepared = render(exports.Prepared, props)
      const opaque = render(exports.Opaque, props)
      try {
        const actual = handle(prepared, resizable)
        const before = style(actual)
        assert.equal(before.paddingTop, 8)
        assert.equal(before.rowGap, 16)
        renderer.act(() => {
          prepared.update(
            React.createElement(exports.Prepared, { ...props, base: { ...base, open: false } }),
          )
          opaque.update(
            React.createElement(exports.Opaque, { ...props, base: { ...base, open: false } }),
          )
        })
        assert.equal(
          handle(prepared, resizable),
          actual,
          'closing must not replace the painted host',
        )
        assert.deepEqual(
          style(actual),
          before,
          'closing must not strip the prepared look before dismissal',
        )
        assert.deepEqual(style(actual), style(handle(opaque, resizable)))
        renderer.act(() => {
          for (const tree of [prepared, opaque]) {
            const modal = tree.root.findAll((node) => node.type === 'Modal')
            assert.equal(modal.length, 1)
            ;(modal[0].props.onDismiss as () => void)()
          }
        })
        assert.equal(prepared.root.findAll((node) => node.type === 'Modal').length, 0)
      } finally {
        unmount(prepared)
        unmount(opaque)
      }
    }
  } finally {
    rn.handleModalModel.platform = 'android'
  }
})
