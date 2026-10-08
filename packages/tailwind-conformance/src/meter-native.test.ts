// `Meter` on React Native (#788): the bar `<meter>` draws on the Web -- a
// track, a fill as wide as the amount, coloured by `low`/`high`/`optimum` --
// through the compiled path and the uncompiled one, which share `HozoMeter`.
// These read the rendered tree against the RN stub; they are not pixels.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const flat = (node: { props: Record<string, unknown> }) =>
  stub.StyleSheet.flatten([node.props.style].flat(Infinity))

const { C } = loadNativeModule(`
  import { Meter } from '@hozo/core'
  export function C({ value, low, high, optimum }) {
    return <Meter accessibilityLabel="Disk usage" value={value} min={0} max={100}
      low={low} high={high} optimum={optimum} className="w-40 h-2 rounded-full bg-slate-200" />
  }`)

function render(props: Record<string, unknown>) {
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, props))
  })
  const views = root.root.findAll((node: Tree) => node.type === 'View')
  const [track, fill] = views
  return { root, track, fill }
}

test('a compiled meter draws a fill as wide as its amount, inside the track its classes style', () => {
  const { root, track, fill } = render({ value: 60 })
  assert.equal(track.props.role, 'meter')
  assert.equal(track.props.accessible, true)
  assert.deepEqual(track.props.accessibilityValue, { text: '60%' })
  const trackStyle = flat(track)
  // The author's classes win over the default box and track colour.
  assert.equal(trackStyle.width, 160)
  assert.equal(trackStyle.height, 8)
  assert.equal(trackStyle.borderRadius, 9999)
  assert.notEqual(trackStyle.backgroundColor, '#efefef')
  assert.equal(trackStyle.overflow, 'hidden')
  const fillStyle = flat(fill)
  assert.equal(fillStyle.width, '60%')
  // No boundaries: every amount is good, as in the browser.
  assert.equal(fillStyle.backgroundColor, '#107c10')
  renderer.act(() => root.unmount())
})

test('low, high and optimum colour the fill the way Chrome does', () => {
  // A disk: emptier is better, so a nearly full one is the poor colour.
  for (const [value, colour] of [
    [20, '#107c10'],
    [70, '#ffb900'],
    [95, '#d83b01'],
  ] as const) {
    const { root, fill } = render({ value, low: 60, high: 90, optimum: 0 })
    assert.equal(flat(fill).backgroundColor, colour, `at ${value}`)
    renderer.act(() => root.unmount())
  }
})

test('an amount outside the range is drawn at its end, and a change redraws it', () => {
  const { root, fill } = render({ value: 140 })
  assert.equal(flat(fill).width, '100%')
  renderer.act(() => root.update(react.createElement(C, { value: 25 })))
  const [, redrawn] = root.root.findAll((node: Tree) => node.type === 'View')
  assert.equal(flat(redrawn).width, '25%')
  renderer.act(() => root.unmount())
})

test('the uncompiled Meter is the same component, with the browser box by default', async () => {
  const { Meter } = (await import('@hozo/semantics')) as { Meter: unknown }
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(Meter, { value: 0.5, low: 0.2, high: 0.8 }))
  })
  const [track, fill] = root.root.findAll((node: Tree) => node.type === 'View')
  assert.deepEqual(track.props.accessibilityValue, { text: '50%' })
  assert.equal(flat(track).width, 80)
  assert.equal(flat(track).height, 16)
  assert.equal(flat(track).backgroundColor, '#efefef')
  assert.equal(flat(fill).width, '50%')
  assert.equal(flat(fill).backgroundColor, '#107c10')
  renderer.act(() => root.unmount())
})
