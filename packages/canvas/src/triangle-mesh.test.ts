import assert from 'node:assert/strict'
import test from 'node:test'

import { canvasNodePoint, hitTestCanvas } from './hit-test.ts'
import { renderCanvas2D } from './render-canvas-2d.ts'
import {
  type CanvasScene,
  canvasTextureUri,
  triangleMeshColor,
  triangleMeshColorCss,
  triangleMeshIndices,
} from './scene.tsx'

const vertices = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
  { x: 20, y: 0 },
  { x: 30, y: 0 },
  { x: 20, y: 10 },
] as const

test('browser texture sources do not invent URLs for Native asset IDs', () => {
  assert.equal(canvasTextureUri('/texture.png'), '/texture.png')
  assert.equal(
    canvasTextureUri({ uri: 'https://example.com/texture.png' }),
    'https://example.com/texture.png',
  )
  assert.equal(canvasTextureUri({ default: '/bundled-texture.png' }), '/bundled-texture.png')
  assert.equal(canvasTextureUri(42), undefined)
})

test('triangle meshes share one validation rule for indexed and consecutive triples', () => {
  assert.deepEqual(triangleMeshIndices({ vertices }), [0, 1, 2, 3, 4, 5])
  assert.deepEqual(
    triangleMeshIndices({
      vertices,
      indices: [3, 4, 5, 0, 99, 2, 0, 1, 2, 4],
    }),
    [3, 4, 5, 0, 1, 2],
  )
  assert.deepEqual(
    triangleMeshIndices({
      vertices,
      colors: [
        { r: 1, g: 0, b: 0 },
        { r: 0, g: 1, b: 0 },
        { r: 0, g: 0, b: 1 },
        { r: Number.NaN, g: 0, b: 0 },
        { r: 1, g: 1, b: 1 },
        { r: 0, g: 0, b: 0 },
      ],
    }),
    [0, 1, 2],
  )
  assert.deepEqual(
    triangleMeshIndices({
      vertices,
      texture: {
        source: '/texture.png',
        coordinates: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 2, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    }),
    [0, 1, 2],
  )
  assert.deepEqual(
    triangleMeshIndices({
      vertices: vertices.slice(0, 3),
      colors: [
        { r: 1, g: 0, b: 0 },
        { r: 0, g: 1, b: 0 },
        { r: 0, g: 0, b: 1 },
      ],
      texture: {
        source: '/texture.png',
        coordinates: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ],
      },
    }),
    [],
  )
})

test('vertex colours clamp normalized channels before reaching either renderer', () => {
  assert.deepEqual(triangleMeshColor({ r: 2, g: -1, b: 0.5 }), { r: 1, g: 0, b: 0.5 })
  assert.equal(triangleMeshColorCss({ r: 1, g: 0, b: 0.5 }), 'rgba(255, 0, 128, 1)')
  assert.equal(triangleMeshColor({ r: Number.NaN, g: 0, b: 0 }), undefined)
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

test('Canvas 2D builds three bounded barycentric colour contributions per face', () => {
  const calls: Array<readonly unknown[]> = []
  const gradients: Array<{
    coordinates: readonly number[]
    stops: Array<readonly [number, string]>
  }> = []
  const context = new Proxy(
    {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      createLinearGradient(...coordinates: number[]) {
        const gradient = { coordinates, stops: [] as Array<readonly [number, string]> }
        gradients.push(gradient)
        return {
          addColorStop(offset: number, color: string) {
            gradient.stops.push([offset, color])
          },
        }
      },
    } as Record<string, unknown>,
    {
      get(target, property) {
        if (property in target) return target[property as string]
        return (...args: unknown[]) => calls.push([property, ...args])
      },
      set(target, property, value) {
        target[property as string] = value
        calls.push([`set:${String(property)}`, value])
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D
  const scene: CanvasScene = [
    {
      kind: 'triangle-mesh',
      props: {
        vertices: vertices.slice(0, 3),
        colors: [
          { r: 1, g: 0, b: 0 },
          { r: 0, g: 1, b: 0 },
          { r: 0, g: 0, b: 1 },
        ],
        opacity: 0.5,
      },
    },
  ]

  renderCanvas2D(context, scene, { width: 20, height: 20, pixelRatio: 1 })

  assert.deepEqual(
    gradients.map(({ coordinates, stops }) => ({ coordinates, stops })),
    [
      {
        coordinates: [5, 5, 0, 0],
        stops: [
          [0, 'rgba(255, 0, 0, 0)'],
          [1, 'rgba(255, 0, 0, 1)'],
        ],
      },
      {
        coordinates: [0, 0, 10, 0],
        stops: [
          [0, 'rgba(0, 255, 0, 0)'],
          [1, 'rgba(0, 255, 0, 1)'],
        ],
      },
      {
        coordinates: [0, 0, 0, 10],
        stops: [
          [0, 'rgba(0, 0, 255, 0)'],
          [1, 'rgba(0, 0, 255, 1)'],
        ],
      },
    ],
  )
  assert.equal(calls.filter(([name]) => name === 'fillRect').length, 4)
  assert.ok(
    calls.some(
      (call) => call[0] === 'set:globalCompositeOperation' && call[1] === 'destination-out',
    ),
  )
  assert.ok(
    calls.some((call) => call[0] === 'set:globalCompositeOperation' && call[1] === 'lighter'),
  )
  assert.ok(calls.some((call) => call[0] === 'set:globalAlpha' && call[1] === 0.5))
})

test('Canvas 2D maps a decoded texture affinely into each triangle', () => {
  const calls: Array<readonly unknown[]> = []
  const context = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
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
  const image = { width: 100, height: 50 } as unknown as CanvasImageSource
  const scene: CanvasScene = [
    {
      kind: 'triangle-mesh',
      props: {
        vertices: vertices.slice(0, 3),
        opacity: 0.5,
        texture: {
          source: '/texture.png',
          filter: 'nearest',
          coordinates: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
        },
      },
    },
  ]

  renderCanvas2D(context, scene, { width: 20, height: 20, pixelRatio: 1 }, (source) =>
    source === '/texture.png' ? image : undefined,
  )

  assert.ok(calls.some((call) => call[0] === 'set:globalAlpha' && call[1] === 0.5))
  assert.ok(calls.some((call) => call[0] === 'set:imageSmoothingEnabled' && call[1] === false))
  assert.deepEqual(calls.find((call) => call[0] === 'transform')?.slice(1), [0.1, 0, 0, 0.2, 0, 0])
  const drawImage = calls.find((call) => call[0] === 'drawImage')
  assert.equal(drawImage?.[1], image)
  assert.deepEqual(drawImage?.slice(2), [0, 0, 100, 50])
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
