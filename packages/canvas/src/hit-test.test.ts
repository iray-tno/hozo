import assert from 'node:assert/strict'
import test from 'node:test'

import { hitTestCanvas } from './hit-test.ts'
import type { CanvasScene } from './scene.tsx'

const interactive = () => true

test('hit testing follows contained viewBox coordinates and reverse paint order', () => {
  const scene: CanvasScene = [
    { id: 'rect', kind: 'rect', props: { x: 0, y: 0, width: 100, height: 100 } },
    { id: 'circle', kind: 'circle', props: { cx: 50, cy: 50, radius: 20 } },
  ]
  const viewport = { width: 200, height: 100, viewBox: [0, 0, 100, 100] as const }

  const topmost = hitTestCanvas(scene, { x: 100, y: 50 }, viewport, interactive)
  assert.deepEqual(topmost, {
    id: 'circle',
    point: { x: 50, y: 50 },
    localPoint: { x: 50, y: 50 },
  })

  const throughDecoration = hitTestCanvas(scene, { x: 100, y: 50 }, viewport, (id) => id === 'rect')
  assert.equal(throughDecoration?.id, 'rect')

  const stretched = hitTestCanvas(
    [{ id: 'offset', kind: 'rect', props: { x: 10, y: 20, width: 10, height: 10 } }],
    { x: 10, y: 10 },
    { width: 200, height: 100, viewBox: [10, 20, 100, 50], fit: 'stretch' },
    interactive,
  )
  assert.deepEqual(stretched?.point, { x: 15, y: 25 })
})

test('group translation, rotation, scale, and origin are inverted before geometry tests', () => {
  const scene: CanvasScene = [{
    kind: 'group',
    props: {
      transform: {
        translateX: 30,
        translateY: 10,
        rotate: 90,
        scaleX: 2,
        scaleY: 2,
        originX: 5,
        originY: 5,
      },
    },
    children: [{ id: 'target', kind: 'rect', props: { width: 10, height: 10 } }],
  }]

  const hit = hitTestCanvas(scene, { x: 43, y: 19 }, { width: 100, height: 100 }, interactive)
  assert.equal(hit?.id, 'target')
  assert.ok(hit && Math.abs(hit.localPoint.x - 7) < 1e-9)
  assert.ok(hit && Math.abs(hit.localPoint.y - 1) < 1e-9)
})

test('rectangle clips constrain descendants and path clips safely refuse portable hits', () => {
  const rectangleClip: CanvasScene = [{
    kind: 'group',
    props: { transform: { translateX: 10 } },
    children: [{
      kind: 'clip',
      props: { x: 0, y: 0, width: 10, height: 10 },
      children: [{ id: 'wide', kind: 'rect', props: { width: 20, height: 20 } }],
    }],
  }]
  assert.equal(
    hitTestCanvas(rectangleClip, { x: 15, y: 5 }, { width: 30, height: 20 }, interactive)?.id,
    'wide',
  )
  assert.equal(
    hitTestCanvas(rectangleClip, { x: 25, y: 5 }, { width: 30, height: 20 }, interactive),
    undefined,
  )

  const pathClip: CanvasScene = [{
    kind: 'clip',
    props: { path: 'M0 0H10V10Z' },
    children: [{ id: 'inside', kind: 'rect', props: { width: 10, height: 10 } }],
  }]
  assert.equal(
    hitTestCanvas(pathClip, { x: 5, y: 5 }, { width: 10, height: 10 }, interactive),
    undefined,
  )
})

test('closed primitive hit areas reject bounding-box-only false positives', () => {
  const rounded: CanvasScene = [{
    id: 'rounded',
    kind: 'rounded-rect',
    props: { width: 20, height: 20, radius: 8 },
  }]
  assert.equal(hitTestCanvas(rounded, { x: 0, y: 0 }, { width: 20, height: 20 }, interactive), undefined)
  assert.equal(
    hitTestCanvas(rounded, { x: 5, y: 5 }, { width: 20, height: 20 }, interactive)?.id,
    'rounded',
  )

  const ellipse: CanvasScene = [{
    id: 'ellipse',
    kind: 'ellipse',
    props: { cx: 10, cy: 10, radiusX: 10, radiusY: 4 },
  }]
  assert.equal(hitTestCanvas(ellipse, { x: 1, y: 6 }, { width: 20, height: 20 }, interactive), undefined)
  assert.equal(
    hitTestCanvas(ellipse, { x: 10, y: 7 }, { width: 20, height: 20 }, interactive)?.id,
    'ellipse',
  )
})

test('singular transforms and invalid viewBoxes cannot produce phantom hits', () => {
  const scene: CanvasScene = [{
    kind: 'group',
    props: { transform: { scaleX: 0 } },
    children: [{ id: 'target', kind: 'rect', props: { width: 10, height: 10 } }],
  }]
  assert.equal(hitTestCanvas(scene, { x: 0, y: 0 }, { width: 10, height: 10 }, interactive), undefined)
  assert.equal(
    hitTestCanvas(
      [{ id: 'target', kind: 'rect', props: { width: 10, height: 10 } }],
      { x: 1, y: 1 },
      { width: 10, height: 10, viewBox: [0, 0, 0, 10] },
      interactive,
    ),
    undefined,
  )
})
