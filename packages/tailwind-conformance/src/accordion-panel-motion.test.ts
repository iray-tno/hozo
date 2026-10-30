// An accordion panel opens and closes by its height on Native when its
// classes ask for a transition of it (#1442): the real generated candidate
// module, the real `accordion.native.tsx`, and the stub's Animated, which
// records what was interpolated and never advances on its own.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openCandidateCache } from '@hozo/compiler'
import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')

interface Timing {
  value: { setValue: (value: number) => void }
  config: { duration: number }
  finish: (finished?: boolean) => void
}
const stub = require('./react-native-stub.js') as {
  Animated: { __hozoTimings: Timing[]; __hozoResetTimings: () => void }
}
const root = fileURLToPath(new URL('../../../', import.meta.url))

// The panel's classes, as `@hozo/ui`'s Accordion writes them.
const animated =
  'overflow-hidden h-[var(--hozo-panel-height)] transition-[height] duration-200 ease-out data-[hozo-state=closed]:h-0 motion-reduce:transition-none'
const plain = 'overflow-hidden'

const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.accordion-motion-'))
const cache = openCandidateCache()
cache.scanFile('Component.tsx', `export const looks = ${JSON.stringify([animated, plain])}`, 1)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule())
const hook = registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@hozo/engine/project'
      ? { url: pathToFileURL(sheet).href, shortCircuit: true }
      : next(specifier, context)
  },
})
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})

const { Accordion } = (await import(
  pathToFileURL(path.join(root, 'packages/patterns/src/accordion.native.tsx')).href
)) as { Accordion: unknown }

interface Instance {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: Instance) => boolean) => Instance[]
}

function mount(panelClassName: string) {
  stub.Animated.__hozoResetTimings()
  let tree: { root: Instance; unmount: () => void } | undefined
  renderer.act(() => {
    tree = renderer.create(
      react.createElement(Accordion, {
        items: [{ id: 'a', header: 'Shipping', content: 'Two days.' }],
        panelClassName,
      }),
    )
  })
  assert.ok(tree)
  const mounted = tree
  const panel = () => mounted.root.findAll((node) => node.type === 'Animated.View')[0]
  return {
    panel,
    press: () => {
      const [header] = mounted.root.findAll(
        (node) =>
          node.props.accessibilityRole === 'header' && typeof node.props.onPress === 'function',
      )
      renderer.act(() => (header!.props.onPress as () => void)())
    },
    measure: (height: number) => {
      const [content] = mounted.root.findAll((node) => typeof node.props.onLayout === 'function')
      renderer.act(() =>
        (content!.props.onLayout as (event: unknown) => void)({
          nativeEvent: { layout: { height } },
        }),
      )
    },
    /** Moves the last animation to `at` -- 1 is its end -- and, at 1, ends it. */
    reach: (at: number) => {
      const last = stub.Animated.__hozoTimings.at(-1)
      assert.ok(last, 'nothing animated')
      renderer.act(() => {
        last.value.setValue(at)
        if (at === 1) last.finish()
      })
    },
    texts: () =>
      mounted.root.findAll((node) => node.type === 'Text').map((node) => node.props.children),
    unmount: () => renderer.act(() => mounted.unmount()),
  }
}

const range = (node: Instance | undefined, key: string) => {
  const style = node?.props.style
  const overrides = (Array.isArray(style) ? style.at(-1) : {}) as Record<
    string,
    { __animatedInterpolation?: { outputRange: unknown[] } }
  >
  return overrides[key]?.__animatedInterpolation?.outputRange
}

test('opening grows the panel from 0 to its measured height', () => {
  const accordion = mount(animated)
  assert.equal(accordion.panel(), undefined, 'a closed panel is not rendered')
  accordion.press()
  assert.equal(accordion.panel()?.type, 'Animated.View')
  accordion.measure(120)
  assert.deepEqual(range(accordion.panel(), 'height'), [0, 120])
  assert.equal(stub.Animated.__hozoTimings.at(-1)?.config.duration, 200)
  accordion.unmount()
})

test('closing shrinks it to 0 while it is out of reach, and removes it at the end', () => {
  const accordion = mount(animated)
  accordion.press()
  accordion.measure(120)
  accordion.reach(1)
  accordion.press()
  const leaving = accordion.panel()
  assert.deepEqual(range(leaving, 'height'), [120, 0])
  assert.equal(leaving?.props.pointerEvents, 'none')
  assert.equal(leaving?.props.accessibilityElementsHidden, true)
  assert.equal(leaving?.props.importantForAccessibility, 'no-hide-descendants')
  accordion.reach(1)
  assert.equal(accordion.panel(), undefined, 'gone once its height reached 0')
  assert.ok(!accordion.texts().includes('Two days.'))
  accordion.unmount()
})

test('reopening halfway through a close grows from where it was, not from the end', () => {
  const accordion = mount(animated)
  accordion.press()
  accordion.measure(120)
  accordion.reach(1)
  accordion.press()
  accordion.reach(0.5)
  accordion.press()
  assert.deepEqual(range(accordion.panel(), 'height'), [60, 120])
  assert.equal(accordion.panel()?.props.pointerEvents, 'auto')
  accordion.unmount()
})

test('a panel whose classes ask for no transition is there or not, as before', () => {
  const accordion = mount(plain)
  accordion.press()
  assert.equal(accordion.panel(), undefined, 'a plain View, not an animated one')
  assert.ok(accordion.texts().includes('Two days.'))
  accordion.press()
  assert.ok(!accordion.texts().includes('Two days.'), 'removed at once')
  assert.equal(stub.Animated.__hozoTimings.length, 0)
  accordion.unmount()
})
