// Text hit testing, which this package refused until now.
//
// The refusal was argued from "a box is not where the ink is": a font box
// reaches below a run with no descenders and above one with no ascenders,
// so a press could land on a label a person cannot see. That is true of a
// font box and false of the one both platforms have had all along.
// Canvas2D answers `actualBoundingBoxAscent`/`Descent` and Skia's
// `measureText` returns a rect around the glyphs -- ink on both sides.
//
// So text is answered the way paths are: by the renderer that drew it,
// through `CanvasRendererQueries`. These tests supply the measurement
// rather than expecting one, because a measurement written here would be
// the third set of metrics the design exists to avoid.

import assert from 'node:assert/strict'
import test from 'node:test'

import { type CanvasTextMeasure, hitTestCanvas } from './hit-test.ts'
import type { CanvasScene } from './scene.tsx'

const viewport = { width: 100, height: 100 }
const interactive = () => true

/**
 * A monospaced stand-in: half an em wide per character, and ink that
 * reaches 0.7em above the baseline and 0.2em below it.
 *
 * Deliberately not a font. What is under test is where the box goes given
 * metrics, not what the metrics are.
 */
function measurer() {
  const asked: string[] = []
  const measureText: CanvasTextMeasure = (props) => {
    asked.push(props.text)
    const size = props.fontSize ?? 16
    return { width: props.text.length * size * 0.5, ascent: size * 0.7, descent: size * 0.2 }
  }
  return { asked, measureText }
}

/** "Jan" at 20px: 30 wide, 14 above the baseline, 4 below. */
const scene: CanvasScene = [
  { id: 'label', kind: 'text', props: { text: 'Jan', x: 10, y: 50, fontSize: 20 } },
]

test('text refuses without a renderer to measure it', () => {
  // The behaviour text had before this existed, kept for a caller with no
  // renderer to ask -- a test, a server. Same refusal a path makes.
  assert.equal(hitTestCanvas(scene, { x: 20, y: 45 }, viewport, interactive), undefined)
})

test('the box runs from the baseline up by the ascent and down by the descent', () => {
  const { asked, measureText } = measurer()
  const hit = (x: number, y: number) =>
    hitTestCanvas(scene, { x, y }, viewport, interactive, { measureText })?.id

  assert.equal(hit(20, 45), 'label', 'a point on the glyphs missed')
  assert.equal(hit(10, 36), 'label', 'the top-left corner missed')
  assert.equal(hit(39, 53), 'label', 'the bottom-right corner missed')
  assert.equal(hit(20, 35), undefined, 'a point above the ink hit')
  assert.equal(hit(20, 55), undefined, 'a point below the ink hit')
  assert.equal(hit(9, 45), undefined, 'a point left of the run hit')
  assert.equal(hit(41, 45), undefined, 'a point right of the run hit')
  assert.equal(asked[0], 'Jan')
})

test('alignment moves the run rather than the anchor', () => {
  // The same rule the renderers follow: `textAlign` shifts the glyphs
  // against `x`, which stays where it was written.
  const at = (textAlign: 'left' | 'center' | 'right', x: number) =>
    hitTestCanvas(
      [
        {
          id: 'label',
          kind: 'text',
          props: { text: 'Jan', x: 50, y: 50, fontSize: 20, textAlign },
        },
      ],
      { x, y: 45 },
      viewport,
      interactive,
      { measureText: measurer().measureText },
    )?.id

  assert.equal(at('left', 60), 'label')
  assert.equal(at('left', 40), undefined)
  assert.equal(at('center', 40), 'label')
  assert.equal(at('center', 60), 'label')
  assert.equal(at('right', 40), 'label')
  assert.equal(at('right', 60), undefined)
})

test('the props reaching the measurer are the ones that will be drawn', () => {
  // A measurement taken with a different size or family agrees with
  // nothing on screen, so the whole node is handed over rather than the
  // string. Getting this wrong is a box of the right shape in the wrong
  // place, which reads as a miss.
  const { measureText } = measurer()
  const seen: unknown[] = []
  hitTestCanvas(
    [
      {
        id: 'label',
        kind: 'text',
        props: { text: 'Jan', x: 0, y: 50, fontSize: 40, fontFamily: 'Inter', fontWeight: 'bold' },
      },
    ],
    { x: 5, y: 45 },
    viewport,
    interactive,
    {
      measureText: (props) => {
        seen.push({ size: props.fontSize, family: props.fontFamily, weight: props.fontWeight })
        return measureText(props)
      },
    },
  )
  assert.deepEqual(seen, [{ size: 40, family: 'Inter', weight: 'bold' }])
})

test('the point is the one inside the ancestors’ transforms', () => {
  const grouped: CanvasScene = [
    {
      kind: 'group',
      props: { transform: { translateX: 30, translateY: 10 } },
      children: scene,
    },
  ]
  const { measureText } = measurer()
  assert.equal(
    hitTestCanvas(grouped, { x: 50, y: 55 }, viewport, interactive, { measureText })?.id,
    'label',
  )
  assert.equal(
    hitTestCanvas(grouped, { x: 20, y: 45 }, viewport, interactive, { measureText }),
    undefined,
  )
})

test('a scene node still carries no handler of its own', () => {
  // The type-level half of the same change lives in `index.test.tsx`:
  // `Canvas.Text` took no `onPress` at all before this, so the refusal
  // was not something an author could work around -- there was nothing to
  // attach. The store keeps the handler and the scene keeps the geometry,
  // as it does for every other pressable shape.
  const node = scene[0]
  assert.ok(node && !('onPress' in node.props))
})
