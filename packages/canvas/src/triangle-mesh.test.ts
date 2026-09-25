import assert from 'node:assert/strict'
import test from 'node:test'

import { canvasNodePoint, hitTestCanvas } from './hit-test.ts'
import { renderCanvas2D } from './render-canvas-2d.ts'
import { type CanvasScene, triangleMeshIndices } from './scene.tsx'

const vertices = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
  { x: 20, y: 0 },
  { x: 30, y: 0 },
  { x: 20, y: 10 },
] as const

test('triangle meshes share one validation rule for indexed and consecutive triples', () => {
  assert.deepEqual(triangleMeshIndices({ vertices }), [0, 1, 2, 3, 4, 5])
  assert.deepEqual(
    triangleMeshIndices({
      vertices,
      indices: [3, 4, 5, 0, 99, 2, 0, 1, 2, 4],
    }),
    [3, 4, 5, 0, 1, 2],
  )
})

test('Canvas 2D paints every valid triangle as its own closed face', () => {
  const calls: Array<readonly unknown[]> = []
  const context = new Proxy({ globalAlpha: 1, fillStyle: '' } as Record<string, unknown>, {
    get(target, property) {
      if (property in target) return target[property as string]
      return (...args: unknown[]) => calls.push([property, ...args])
    },
    set(target, property, value) {
      target[property as string] = value
      calls.push([`set:${String(property)}`, value])
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  const scene: CanvasScene = [
    {
      kind: 'triangle-mesh',
      props: { vertices, indices: [0, 1, 2, 3, 99, 5, 3, 4, 5], fill: '#2563eb' },
    },
  ]

  renderCanvas2D(context, scene, { width: 40, height: 20, pixelRatio: 1 })

  assert.deepEqual(
    calls.filter(([name]) => ['moveTo', 'lineTo', 'closePath', 'fill'].includes(String(name))),
    [
      ['moveTo', 0, 0],
      ['lineTo', 10, 0],
      ['lineTo', 0, 10],
      ['closePath'],
      ['fill'],
      ['moveTo', 20, 0],
      ['lineTo', 30, 0],
      ['lineTo', 20, 10],
      ['closePath'],
      ['fill'],
    ],
  )
  assert.ok(calls.some((call) => call[0] === 'set:fillStyle' && call[1] === '#2563eb'))
})

test('triangle mesh hit testing follows faces rather than their combined bounds', () => {
  const scene: CanvasScene = [{ id: 'mesh', kind: 'triangle-mesh', props: { vertices } }]
  const viewport = { width: 40, height: 20 }

  assert.equal(hitTestCanvas(scene, { x: 2, y: 2 }, viewport, () => true)?.id, 'mesh')
  assert.equal(
    hitTestCanvas(scene, { x: 15, y: 2 }, viewport, () => true),
    undefined,
  )
  assert.equal(hitTestCanvas(scene, { x: 1, y: 9 }, viewport, () => true)?.id, 'mesh')
  assert.deepEqual(canvasNodePoint(scene, 'mesh', viewport), {
    point: { x: 10 / 3, y: 10 / 3 },
    surfacePoint: { x: 10 / 3, y: 10 / 3 },
  })
})

test('empty, invalid, degenerate, and unpainted meshes do not accept a hit', () => {
  const viewport = { width: 20, height: 20 }
  const scenes: CanvasScene[] = [
    [{ id: 'mesh', kind: 'triangle-mesh', props: { vertices: [] } }],
    [{ id: 'mesh', kind: 'triangle-mesh', props: { vertices, indices: [0, 1, 99] } }],
    [{ id: 'mesh', kind: 'triangle-mesh', props: { vertices, indices: [0, 0, 0] } }],
    [{ id: 'mesh', kind: 'triangle-mesh', props: { vertices, fill: 'none' } }],
  ]
  for (const scene of scenes) {
    assert.equal(
      hitTestCanvas(scene, { x: 1, y: 1 }, viewport, () => true),
      undefined,
    )
  }
})
