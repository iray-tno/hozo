import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BufferGeometry,
  Camera,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Uint16BufferAttribute,
} from 'three'

import { projectThreeScene } from './project.ts'

function triangleGeometry(vertices = [-1, -1, 0, 1, -1, 0, 0, 1, 0]) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  return geometry
}

function perspective() {
  const camera = new PerspectiveCamera(90, 1, 1, 10)
  camera.position.z = 5
  return camera
}

function projectedPaths(result: ReturnType<typeof projectThreeScene>) {
  return result.scene.map((node) => {
    assert.equal(node.kind, 'path')
    if (node.kind !== 'path') throw new Error('projection emitted a non-path node')
    return node.props
  })
}

test('a Three.js triangle becomes a Canvas path in viewport coordinates', () => {
  const scene = new Scene()
  scene.add(new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#2563eb' })))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedPaths(result), [
    {
      path: 'M 40 60 L 60 60 L 50 40 Z',
      fill: '#2563eb',
    },
  ])
})

test('indexed geometry emits each triangle', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
  )
  geometry.setIndex(new Uint16BufferAttribute([0, 1, 2, 0, 2, 3], 1))
  const scene = new Scene()
  scene.add(new Mesh(geometry, new MeshBasicMaterial({ color: '#ff0000' })))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.equal(result.scene.length, 2)
  assert.ok(projectedPaths(result).every((path) => path.fill === '#ff0000'))
})

test('world transforms under groups are baked into the projected path', () => {
  const scene = new Scene()
  const group = new Group()
  group.position.x = 1
  group.add(new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#00ff00' })))
  scene.add(group)
  const camera = new OrthographicCamera(-2, 2, 2, -2, 1, 10)
  camera.position.z = 5

  const result = projectThreeScene(scene, camera, { width: 100, height: 100 })

  assert.equal(projectedPaths(result)[0]?.path, 'M 50 75 L 100 75 L 75 25 Z')
})

test('the homogeneous clip volume cuts a near-plane crossing instead of exploding it', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(
      triangleGeometry([-1, -1, -2, 1, -1, -2, 0, 1, -0.5]),
      new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }),
    ),
  )
  const camera = new PerspectiveCamera(90, 1, 1, 10)

  const result = projectThreeScene(scene, camera, { width: 100, height: 100 })
  const paths = projectedPaths(result)

  assert.equal(paths.length, 2)
  assert.ok(paths.every(({ path }) => !path.includes('Infinity') && !path.includes('NaN')))
})

test('geometry wholly behind the camera is absent', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(
      triangleGeometry([-1, -1, 1, 1, -1, 1, 0, 1, 1]),
      new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }),
    ),
  )
  const camera = new PerspectiveCamera(90, 1, 1, 10)

  const result = projectThreeScene(scene, camera, { width: 100, height: 100 })

  assert.deepEqual(result.scene, [])
})

test('face side is respected after the viewport y-axis is flipped', () => {
  const scene = new Scene()
  const reversed = triangleGeometry([-1, -1, 0, 0, 1, 0, 1, -1, 0])
  const material = new MeshBasicMaterial({ color: '#ffffff' })
  scene.add(new Mesh(reversed, material))

  assert.equal(projectThreeScene(scene, perspective(), { width: 100, height: 100 }).scene.length, 0)

  material.side = DoubleSide
  assert.equal(projectThreeScene(scene, perspective(), { width: 100, height: 100 }).scene.length, 1)
})

test('far triangles are painted before near triangles', () => {
  const scene = new Scene()
  const near = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#ff0000' }))
  const far = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#0000ff' }))
  far.position.z = -1
  scene.add(near, far)

  const fills = projectedPaths(
    projectThreeScene(scene, perspective(), { width: 100, height: 100 }),
  ).map((path) => path.fill)

  assert.deepEqual(fills, ['#0000ff', '#ff0000'])
})

test('an invisible material emits neither geometry nor a diagnostic', () => {
  const scene = new Scene()
  const material = new MeshBasicMaterial({ color: '#ffffff' })
  material.visible = false
  scene.add(new Mesh(triangleGeometry(), material))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.scene, [])
  assert.deepEqual(result.diagnostics, [])
})

test('unsupported inputs are omitted with actionable diagnostics', () => {
  const scene = new Scene()
  const material = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 })
  scene.add(new Mesh(triangleGeometry(), material))
  const reported: string[] = []

  const materialResult = projectThreeScene(scene, perspective(), {
    width: 100,
    height: 100,
    onDiagnostic: ({ code }) => reported.push(code),
  })
  const cameraResult = projectThreeScene(scene, new Camera(), { width: 100, height: 100 })
  const viewportResult = projectThreeScene(scene, perspective(), { width: 0, height: 100 })

  assert.deepEqual(materialResult.scene, [])
  assert.equal(materialResult.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  assert.deepEqual(reported, ['UNSUPPORTED_MATERIAL'])
  assert.equal(cameraResult.diagnostics[0]?.code, 'UNSUPPORTED_CAMERA')
  assert.equal(viewportResult.diagnostics[0]?.code, 'INVALID_VIEWPORT')
})
