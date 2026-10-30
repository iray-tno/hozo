// A pattern's indicator animates on Native what its classes animate on the
// Web (#1450): the real generated candidate module, the real control
// indicator, and the stub's Animated, which records what was interpolated.
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
const stub = require('./react-native-stub.js') as {
  Animated: { __hozoTimings: { config: { duration: number } }[]; __hozoResetTimings: () => void }
}
const root = fileURLToPath(new URL('../../../', import.meta.url))

// The thumb's two looks, as `@hozo/ui`'s `switchIndicator` writes them.
const motion =
  'transition-[inset-inline-start,background-color] duration-150 ease-out motion-reduce:transition-colors'
const off = `absolute start-1 top-1 size-2 rounded-full bg-[#ffffff] ${motion}`
const on = `absolute start-4 top-1 size-2 rounded-full bg-[#000000] ${motion}`
const plain = 'absolute start-1 top-1 size-2 rounded-full bg-[#ffffff]'
const plainOn = 'absolute start-4 top-1 size-2 rounded-full bg-[#000000]'

const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.switch-motion-'))
const cache = openCandidateCache()
cache.scanFile(
  'Component.tsx',
  `export const looks = ${JSON.stringify([off, on, plain, plainOn])}`,
  1,
)
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

const { controlIndicator } = (await import(
  pathToFileURL(path.join(root, 'packages/patterns/src/control-indicator.native.tsx')).href
)) as {
  controlIndicator: (look: { className: string; markClassName?: string }, state: object) => unknown
}

function Indicator({ mark }: { mark: string }) {
  return controlIndicator({ className: 'h-4 w-7', markClassName: mark }, {})
}

interface Node {
  type: string
  props: { style: unknown }
  children: Node[] | null
}

function toggle(from: string, to: string) {
  stub.Animated.__hozoResetTimings()
  let tree:
    | { update: (element: unknown) => void; toJSON: () => Node; unmount: () => void }
    | undefined
  // One component type for both renders, so the second is an update of the
  // first and not a fresh mount.
  const draw = (mark: string) => react.createElement(Indicator, { mark })
  renderer.act(() => {
    tree = renderer.create(draw(from))
  })
  assert.ok(tree)
  const mounted = tree
  renderer.act(() => mounted.update(draw(to)))
  const thumb = mounted.toJSON().children?.[0]
  const timings = stub.Animated.__hozoTimings.length
  renderer.act(() => mounted.unmount())
  return { thumb, timings }
}

const range = (style: unknown, key: string) => {
  const overrides = (Array.isArray(style) ? style.at(-1) : {}) as Record<
    string,
    { __animatedInterpolation?: { outputRange: unknown[] } }
  >
  return overrides[key]?.__animatedInterpolation?.outputRange
}

test('a thumb whose classes ask for a transition slides and fades to its new look', () => {
  const { thumb, timings } = toggle(off, on)
  assert.equal(thumb?.type, 'Animated.View')
  assert.ok(timings > 0, 'nothing animated')
  assert.deepEqual(range(thumb?.props.style, 'start'), [4, 16])
  assert.deepEqual(range(thumb?.props.style, 'backgroundColor'), ['#ffffff', '#000000'])
})

test('a thumb with no transition classes is the plain View it was, with nothing animated', () => {
  const { thumb, timings } = toggle(plain, plainOn)
  assert.equal(thumb?.type, 'View')
  assert.equal(timings, 0)
})
