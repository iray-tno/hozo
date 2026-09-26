import assert from 'node:assert/strict'
import test from 'node:test'

import * as THREE from 'three'
import {
  BufferGeometry,
  Camera,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshNormalMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Texture,
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

function groupedSquareGeometry() {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
  )
  geometry.setIndex(new Uint16BufferAttribute([0, 1, 2, 0, 2, 3], 1))
  geometry.addGroup(0, 3, 0)
  geometry.addGroup(3, 3, 1)
  return geometry
}

function projectedPaths(result: ReturnType<typeof projectThreeScene>) {
  return result.scene.map((node) => {
    assert.equal(node.kind, 'path')
    if (node.kind !== 'path') throw new Error('projection emitted a non-path node')
    return node.props
  })
}

function projectedLines(result: ReturnType<typeof projectThreeScene>) {
  return result.scene.map((node) => {
    assert.equal(node.kind, 'line')
    if (node.kind !== 'line') throw new Error('projection emitted a non-line node')
    return node.props
  })
}

function projectedCircles(result: ReturnType<typeof projectThreeScene>) {
  return result.scene.map((node) => {
    assert.equal(node.kind, 'circle')
    if (node.kind !== 'circle') throw new Error('projection emitted a non-circle node')
    return node.props
  })
}

function projectedMeshes(result: ReturnType<typeof projectThreeScene>) {
  return result.scene.map((node) => {
    assert.equal(node.kind, 'triangle-mesh')
    if (node.kind !== 'triangle-mesh') throw new Error('projection emitted a non-mesh node')
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

test('mesh vertex colours become a portable interpolated triangle', () => {
  const geometry = triangleGeometry()
  geometry.setAttribute('color', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3))
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }))

  const result = projectThreeScene(new Scene().add(mesh), perspective(), {
    width: 100,
    height: 100,
  })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedMeshes(result), [
    {
      colors: [
        { r: 0.9999999999999999, g: 0, b: 0 },
        { r: 0, g: 0.9999999999999999, b: 0 },
        { r: 0, g: 0, b: 0.9999999999999999 },
      ],
      vertices: [
        { x: 40, y: 60 },
        { x: 60, y: 60 },
        { x: 50, y: 40 },
      ],
    },
  ])
})

test('MeshBasicMaterial map and UVs become a portable textured triangle', () => {
  const geometry = triangleGeometry()
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))
  const texture = new Texture()
  texture.source.data = { uri: '/checkerboard.png' }
  texture.colorSpace = THREE.SRGBColorSpace
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ map: texture }))

  const result = projectThreeScene(new Scene().add(mesh), perspective(), {
    width: 100,
    height: 100,
  })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedMeshes(result), [
    {
      texture: {
        source: { uri: '/checkerboard.png' },
        coordinates: [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 0.5, y: 0 },
        ],
        filter: 'linear',
      },
      vertices: [
        { x: 40, y: 60 },
        { x: 60, y: 60 },
        { x: 50, y: 40 },
      ],
    },
  ])
})

test('RepeatWrapping preserves out-of-range UVs for portable tiling', () => {
  const geometry = triangleGeometry()
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
  const texture = new Texture()
  texture.source.data = '/tiles.png'
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping

  const result = projectThreeScene(
    new Scene().add(new Mesh(geometry, new MeshBasicMaterial({ map: texture }))),
    perspective(),
    { width: 100, height: 100 },
  )

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedMeshes(result)[0]?.texture, {
    source: '/tiles.png',
    coordinates: [
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: -1 },
    ],
    filter: 'linear',
    wrap: 'repeat',
  })
})

test('mixed clamp and repeat wrapping stays portable per texture axis', () => {
  const geometry = triangleGeometry()
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 1], 2))
  const texture = new Texture()
  texture.source.data = '/stripes.png'
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping

  const result = projectThreeScene(
    new Scene().add(new Mesh(geometry, new MeshBasicMaterial({ map: texture }))),
    perspective(),
    { width: 100, height: 100 },
  )

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedMeshes(result)[0]?.texture, {
    source: '/stripes.png',
    coordinates: [
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 0 },
    ],
    filter: 'linear',
    wrapX: 'repeat',
    wrapY: 'clamp',
  })
})

test('mesh clipping interpolates texture coordinates at generated edges', () => {
  const geometry = triangleGeometry()
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))
  const texture = new Texture()
  texture.source.data = '/checkerboard.png'
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new MeshBasicMaterial({
    clippingPlanes: [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)],
    map: texture,
  })

  const result = projectThreeScene(new Scene().add(new Mesh(geometry, material)), perspective(), {
    width: 100,
    height: 100,
  })

  assert.deepEqual(result.diagnostics, [])
  const [triangle] = projectedMeshes(result)
  assert.deepEqual(triangle?.vertices, [
    { x: 50, y: 40 },
    { x: 50, y: 60 },
    { x: 60, y: 60 },
  ])
  assert.deepEqual(triangle?.texture?.coordinates, [
    { x: 0.5, y: 0 },
    { x: 0.5, y: 1 },
    { x: 1, y: 1 },
  ])
})

test('non-portable texture sampling is refused with an actionable diagnostic', () => {
  const texture = new Texture()
  texture.source.data = '/checkerboard.png'
  texture.colorSpace = THREE.SRGBColorSpace

  const missingUvs = projectThreeScene(
    new Scene().add(new Mesh(triangleGeometry(), new MeshBasicMaterial({ map: texture }))),
    perspective(),
    { width: 100, height: 100 },
  )
  assert.equal(missingUvs.diagnostics[0]?.code, 'UNSUPPORTED_GEOMETRY')
  assert.match(missingUvs.diagnostics[0]?.message ?? '', /two-component uv/)

  const repeatedGeometry = triangleGeometry()
  repeatedGeometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))
  texture.wrapS = THREE.MirroredRepeatWrapping
  const mirrored = projectThreeScene(
    new Scene().add(new Mesh(repeatedGeometry, new MeshBasicMaterial({ map: texture }))),
    perspective(),
    { width: 100, height: 100 },
  )
  assert.equal(mirrored.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  assert.match(mirrored.diagnostics[0]?.message ?? '', /mirrored wrapping/)

  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.offset.x = 0.5
  const transformedOutside = projectThreeScene(
    new Scene().add(new Mesh(repeatedGeometry, new MeshBasicMaterial({ map: texture }))),
    perspective(),
    { width: 100, height: 100 },
  )
  assert.equal(transformedOutside.diagnostics[0]?.code, 'UNSUPPORTED_GEOMETRY')
  assert.match(transformedOutside.diagnostics[0]?.message ?? '', /inside 0\.\.1/)
})

test('mesh clipping interpolates vertex colours at generated edges', () => {
  const geometry = triangleGeometry()
  geometry.setAttribute('color', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3))
  const material = new MeshBasicMaterial({
    clippingPlanes: [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)],
    vertexColors: true,
  })

  const result = projectThreeScene(new Scene().add(new Mesh(geometry, material)), perspective(), {
    width: 100,
    height: 100,
  })

  assert.deepEqual(result.diagnostics, [])
  const [triangle] = projectedMeshes(result)
  assert.deepEqual(triangle?.vertices, [
    { x: 50, y: 40 },
    { x: 50, y: 60 },
    { x: 60, y: 60 },
  ])
  assert.deepEqual(triangle?.colors?.[0], { r: 0, g: 0, b: 0.9999999999999999 })
  assert.deepEqual(triangle?.colors?.[2], { r: 0, g: 0.9999999999999999, b: 0 })
  const clippedRed = triangle?.colors?.[1]?.r ?? 0
  const clippedGreen = triangle?.colors?.[1]?.g ?? 0
  assert.ok(clippedRed > 0.73 && clippedRed < 0.74)
  assert.equal(clippedGreen, clippedRed)
  assert.equal(triangle?.colors?.[1]?.b, 0)
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

test('material arrays preserve BufferGeometry group colours', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(groupedSquareGeometry(), [
      new MeshBasicMaterial({ color: '#ef4444' }),
      new MeshBasicMaterial({ color: '#3b82f6' }),
    ]),
  )

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(
    projectedPaths(result).map(({ fill }) => fill),
    ['#ef4444', '#3b82f6'],
  )
})

test('material groups intersect the geometry draw range', () => {
  const geometry = groupedSquareGeometry()
  geometry.setDrawRange(3, 3)
  const scene = new Scene()
  scene.add(
    new Mesh(geometry, [
      new MeshBasicMaterial({ color: '#ef4444' }),
      new MeshBasicMaterial({ color: '#3b82f6' }),
    ]),
  )

  const paths = projectedPaths(projectThreeScene(scene, perspective(), { width: 100, height: 100 }))

  assert.equal(paths.length, 1)
  assert.equal(paths[0]?.fill, '#3b82f6')
})

test('groups can mix solid and wireframe MeshBasicMaterial', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(groupedSquareGeometry(), [
      new MeshBasicMaterial({ color: '#ef4444' }),
      new MeshBasicMaterial({ color: '#3b82f6', wireframe: true }),
    ]),
  )

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(
    result.scene.map((node) => [
      node.kind,
      node.kind === 'path' ? node.props.fill : node.kind === 'line' ? node.props.stroke : undefined,
    ]),
    [
      ['path', '#ef4444'],
      ['line', '#3b82f6'],
      ['line', '#3b82f6'],
      ['line', '#3b82f6'],
    ],
  )
})

test('unsupported group materials are diagnosed without hiding supported groups', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(groupedSquareGeometry(), [
      new MeshBasicMaterial({ color: '#ef4444' }),
      new MeshNormalMaterial(),
    ]),
  )

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.equal(result.scene.length, 1)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
})

test('a material array without geometry groups renders nothing, as in Three.js', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(triangleGeometry(), [
      new MeshBasicMaterial({ color: '#ef4444' }),
      new MeshBasicMaterial({ color: '#3b82f6' }),
    ]),
  )

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.scene, [])
  assert.deepEqual(result.diagnostics, [])
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

test('renderOrder overrides painter depth while preserving stable object order', () => {
  const scene = new Scene()
  const near = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#ff0000' }))
  const far = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#0000ff' }))
  far.position.z = -1
  far.renderOrder = 1
  scene.add(near, far)

  const fills = projectedPaths(
    projectThreeScene(scene, perspective(), { width: 100, height: 100 }),
  ).map((path) => path.fill)

  assert.deepEqual(fills, ['#ff0000', '#0000ff'])
})

test('Group renderOrder applies to its projected descendants', () => {
  const scene = new Scene()
  const lateGroup = new Group()
  lateGroup.renderOrder = 1
  lateGroup.add(new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#0000ff' })))
  const lateChild = lateGroup.children[0]
  assert.ok(lateChild)
  lateChild.position.z = -1
  scene.add(lateGroup, new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#ff0000' })))

  const fills = projectedPaths(
    projectThreeScene(scene, perspective(), { width: 100, height: 100 }),
  ).map((path) => path.fill)

  assert.deepEqual(fills, ['#ff0000', '#0000ff'])
})

test('camera layers filter objects without hiding matching descendants', () => {
  const scene = new Scene()
  const hiddenParent = new Group()
  hiddenParent.layers.set(1)
  hiddenParent.add(new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#ff0000' })))
  const hiddenMesh = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#0000ff' }))
  hiddenMesh.layers.set(1)
  scene.add(hiddenParent, hiddenMesh)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(
    projectedPaths(result).map((path) => path.fill),
    ['#ff0000'],
  )
})

test('solid scene backgrounds become non-interactive Canvas rectangles', () => {
  const scene = new Scene()
  scene.background = new THREE.Color('#123456')

  const result = projectThreeScene(scene, perspective(), { width: 120, height: 80 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.scene, [
    {
      kind: 'rect',
      props: { x: 0, y: 0, width: 120, height: 80, fill: '#123456' },
    },
  ])
  assert.deepEqual(result.objects, [undefined])
})

test('a 2D texture background becomes a viewport-sized portable mesh', () => {
  const scene = new Scene()
  const background = new Texture()
  background.source.data = '/background.png'
  background.colorSpace = THREE.SRGBColorSpace
  scene.background = background

  const result = projectThreeScene(scene, perspective(), { width: 120, height: 80 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.objects, [undefined])
  assert.deepEqual(result.scene, [
    {
      kind: 'triangle-mesh',
      props: {
        indices: [0, 1, 2, 0, 2, 3],
        texture: {
          source: '/background.png',
          coordinates: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
          filter: 'linear',
        },
        vertices: [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
          { x: 120, y: 80 },
          { x: 0, y: 80 },
        ],
      },
    },
  ])
})

test('environment backgrounds are diagnosed while portable geometry remains visible', () => {
  const scene = new Scene()
  scene.background = new THREE.CubeTexture()
  scene.add(new Mesh(triangleGeometry(), new MeshBasicMaterial()))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.equal(result.scene.length, 1)
  assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_SCENE')
})

test('Scene.overrideMaterial preserves render-list visibility and allowOverride', () => {
  const visible = new MeshBasicMaterial({ color: '#ff0000' })
  const hidden = new MeshBasicMaterial({ color: '#0000ff' })
  hidden.visible = false
  const grouped = new Mesh(groupedSquareGeometry(), [visible, hidden])
  const protectedMaterial = new MeshBasicMaterial({ color: '#f59e0b' })
  protectedMaterial.allowOverride = false
  const protectedMesh = new Mesh(triangleGeometry(), protectedMaterial)
  protectedMesh.position.x = 3
  const scene = new Scene()
  scene.overrideMaterial = new MeshBasicMaterial({ color: '#16a34a' })
  scene.add(grouped, protectedMesh)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(
    projectedPaths(result).map(({ fill }) => fill),
    ['#16a34a', '#f59e0b'],
  )

  scene.overrideMaterial = new THREE.MeshNormalMaterial()
  const unsupported = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
  assert.equal(unsupported.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  assert.deepEqual(
    projectedPaths(unsupported).map(({ fill }) => fill),
    ['#f59e0b'],
  )
})

test('linear fog blends mesh vertices and honours material fog opt-out', () => {
  const scene = new Scene()
  const material = new MeshBasicMaterial({ color: '#000000' })
  scene.add(new Mesh(triangleGeometry(), material))
  scene.fog = new THREE.Fog('#ffffff', 0, 10)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  const [triangle] = projectedMeshes(result)
  assert.equal(triangle?.colors?.length, 3)
  for (const color of triangle?.colors ?? []) {
    assert.ok(color.r > 0.73 && color.r < 0.74)
    assert.equal(color.g, color.r)
    assert.equal(color.b, color.r)
  }

  material.fog = false
  const optedOut = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
  assert.deepEqual(optedOut.diagnostics, [])
  assert.deepEqual(projectedPaths(optedOut), [
    { path: 'M 40 60 L 60 60 L 50 40 Z', fill: '#000000' },
  ])
})

test('fog is evaluated at vertices created by homogeneous clipping', () => {
  const scene = new Scene()
  scene.fog = new THREE.Fog('#ffffff', 0, 10)
  scene.add(
    new Mesh(
      triangleGeometry([-1, -1, -2, 1, -1, -2, 0, 1, -0.5]),
      new MeshBasicMaterial({ color: '#000000', side: DoubleSide }),
    ),
  )
  const camera = new PerspectiveCamera(90, 1, 1, 10)

  const triangles = projectedMeshes(projectThreeScene(scene, camera, { width: 100, height: 100 }))

  assert.equal(triangles.length, 2)
  const channels = triangles.flatMap(({ colors }) => colors?.map(({ r }) => r) ?? [])
  // The two near-plane intersections have view depth 1. Their smoothstep
  // fog factor is 0.028, encoded to sRGB as roughly 0.183.
  assert.ok(channels.filter((channel) => channel > 0.18 && channel < 0.19).length >= 2)
  assert.ok(channels.every(Number.isFinite))
})

test('fog follows lines, points, sprites, and exponential density', () => {
  const camera = perspective()
  const linearFog = new THREE.Fog('#ffffff', 0, 10)
  const lineGeometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute([-1, 0, 0, 1, 0, -4], 3),
  )
  const lineScene = new Scene()
  lineScene.fog = linearFog
  lineScene.add(new Line(lineGeometry, new LineBasicMaterial({ color: '#000000' })))
  const [line] = projectedLines(projectThreeScene(lineScene, camera, { width: 100, height: 100 }))
  assert.equal(typeof line?.stroke, 'object')
  if (!line?.stroke || typeof line.stroke === 'string')
    throw new Error('fog did not make a gradient')
  assert.deepEqual(
    line.stroke.stops.map(({ color }) => color),
    ['#bcbcbc', '#fcfcfc'],
  )

  const wireframeScene = new Scene()
  wireframeScene.fog = linearFog
  wireframeScene.add(
    new Mesh(
      triangleGeometry([-1, -1, 0, 1, -1, -4, 0, 1, 0]),
      new MeshBasicMaterial({ color: '#000000', wireframe: true }),
    ),
  )
  const wireframe = projectedLines(
    projectThreeScene(wireframeScene, camera, { width: 100, height: 100 }),
  )
  assert.equal(wireframe.length, 3)
  assert.ok(wireframe.every(({ stroke }) => typeof stroke === 'object'))

  const expScene = new Scene()
  expScene.fog = new THREE.FogExp2('#ffffff', 0.2)
  expScene.add(
    new Points(
      new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3)),
      new PointsMaterial({ color: '#000000', size: 2, sizeAttenuation: false }),
    ),
  )
  const expFactor = 1 - Math.exp(-1)
  const expectedExp = `#${new THREE.Color('#000000').lerp(new THREE.Color('#ffffff'), expFactor).getHexString()}`
  assert.equal(
    projectedCircles(projectThreeScene(expScene, camera, { width: 100, height: 100 }))[0]?.fill,
    expectedExp,
  )

  const spriteScene = new Scene()
  spriteScene.fog = linearFog
  spriteScene.add(new THREE.Sprite(new THREE.SpriteMaterial({ color: '#000000' })))
  assert.equal(
    projectedPaths(projectThreeScene(spriteScene, camera, { width: 100, height: 100 }))[0]?.fill,
    '#bcbcbc',
  )
})

test('invalid fog ranges are diagnosed instead of producing non-finite colours', () => {
  const scene = new Scene()
  const fog = new THREE.Fog('#ffffff', 1, 10)
  fog.far = 1
  scene.fog = fog
  scene.add(new Mesh(triangleGeometry(), new MeshBasicMaterial()))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.scene, [])
  assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_SCENE')
})

test('wireframe MeshBasicMaterial becomes three Canvas lines per triangle', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(
      triangleGeometry(),
      new MeshBasicMaterial({ color: '#16a34a', wireframe: true, wireframeLinewidth: 3 }),
    ),
  )

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedLines(result), [
    { x1: 40, y1: 60, x2: 60, y2: 60, stroke: '#16a34a', strokeWidth: 3 },
    { x1: 60, y1: 60, x2: 50, y2: 40, stroke: '#16a34a', strokeWidth: 3 },
    { x1: 50, y1: 40, x2: 40, y2: 60, stroke: '#16a34a', strokeWidth: 3 },
  ])
})

test('wireframe projection applies the same doubled draw range as Three.js', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
  )
  geometry.setIndex(new Uint16BufferAttribute([0, 1, 2, 0, 2, 3], 1))
  geometry.setDrawRange(3, 3)
  const scene = new Scene()
  scene.add(new Mesh(geometry, new MeshBasicMaterial({ wireframe: true })))

  const lines = projectedLines(projectThreeScene(scene, perspective(), { width: 100, height: 100 }))

  assert.equal(lines.length, 3)
  assert.deepEqual(lines[0], {
    x1: 40,
    y1: 60,
    x2: 60,
    y2: 40,
    stroke: '#ffffff',
    strokeWidth: 1,
  })
})

test('wireframe clips original edges without inventing a clip-plane edge', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(
      triangleGeometry([-1, -1, -2, 1, -1, -2, 0, 1, -0.5]),
      new MeshBasicMaterial({ wireframe: true }),
    ),
  )
  const camera = new PerspectiveCamera(90, 1, 1, 10)

  const lines = projectedLines(projectThreeScene(scene, camera, { width: 100, height: 100 }))

  assert.equal(lines.length, 3)
  assert.ok(lines.every(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2].every(Number.isFinite)))
})

test('LineSegments become independent Canvas lines with material colour and width', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0], 3),
  )
  const scene = new Scene()
  scene.add(new LineSegments(geometry, new LineBasicMaterial({ color: '#7c3aed', linewidth: 3 })))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedLines(result), [
    { x1: 40, y1: 50, x2: 60, y2: 50, stroke: '#7c3aed', strokeWidth: 3 },
    { x1: 50, y1: 60, x2: 50, y2: 40, stroke: '#7c3aed', strokeWidth: 3 },
  ])
})

test('Line connects adjacent vertices and honours indexed draw ranges', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-2, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0], 3),
  )
  geometry.setIndex(new Uint16BufferAttribute([0, 1, 2, 3], 1))
  geometry.setDrawRange(1, 3)
  const scene = new Scene()
  scene.add(new Line(geometry, new LineBasicMaterial()))

  const lines = projectedLines(projectThreeScene(scene, perspective(), { width: 100, height: 100 }))

  assert.equal(lines.length, 2)
  assert.deepEqual(
    lines.map(({ x1, x2 }) => [x1, x2]),
    [
      [40, 50],
      [50, 60],
    ],
  )
})

test('LineLoop closes its final vertex back to its first', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  const scene = new Scene()
  scene.add(new LineLoop(geometry, new LineBasicMaterial()))

  const lines = projectedLines(projectThreeScene(scene, perspective(), { width: 100, height: 100 }))

  assert.equal(lines.length, 3)
  assert.deepEqual(lines.at(-1), {
    x1: 50,
    y1: 40,
    x2: 40,
    y2: 50,
    stroke: '#ffffff',
    strokeWidth: 1,
  })
})

test('LineBasicMaterial projects clipped RGB vertex colours as a portable gradient', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3))
  geometry.setAttribute('color', new Float32BufferAttribute([1, 0, 0, 0, 0, 1], 3))
  const material = new LineBasicMaterial({
    clippingPlanes: [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)],
    vertexColors: true,
  })
  const scene = new Scene()
  const line = new Line(geometry, material)
  scene.add(line)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedLines(result), [
    {
      x1: 50,
      y1: 50,
      x2: 60,
      y2: 50,
      stroke: {
        kind: 'linear',
        from: { x: 50, y: 50 },
        to: { x: 60, y: 50 },
        stops: [
          { offset: 0, color: '#bc00bc' },
          { offset: 1, color: '#0000ff' },
        ],
      },
      strokeWidth: 1,
    },
  ])

  geometry.setAttribute('lineDistance', new Float32BufferAttribute([0, 2], 1))
  line.material = new LineDashedMaterial({
    dashSize: 0.5,
    gapSize: 0.5,
    vertexColors: true,
  })
  const dashed = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
  assert.deepEqual(dashed.diagnostics, [])
  assert.deepEqual(projectedLines(dashed), [
    {
      x1: 40,
      y1: 50,
      x2: 45,
      y2: 50,
      stroke: {
        kind: 'linear',
        from: { x: 40, y: 50 },
        to: { x: 45, y: 50 },
        stops: [
          { offset: 0, color: '#ff0000' },
          { offset: 1, color: '#e10089' },
        ],
      },
      strokeWidth: 1,
    },
    {
      x1: 50,
      y1: 50,
      x2: 55.00000000000001,
      y2: 50,
      stroke: {
        kind: 'linear',
        from: { x: 50, y: 50 },
        to: { x: 55.00000000000001, y: 50 },
        stops: [
          { offset: 0, color: '#bc00bc' },
          { offset: 1, color: '#8900e1' },
        ],
      },
      strokeWidth: 1,
    },
  ])
})

test('a line crossing the near plane is clipped to finite viewport coordinates', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-0.25, 0, -0.5, 1, 0, -2], 3))
  const scene = new Scene()
  scene.add(new Line(geometry, new LineBasicMaterial()))
  const camera = new PerspectiveCamera(90, 1, 1, 10)

  const lines = projectedLines(projectThreeScene(scene, camera, { width: 100, height: 100 }))

  assert.equal(lines.length, 1)
  assert.ok(
    [lines[0]?.x1, lines[0]?.y1, lines[0]?.x2, lines[0]?.y2].every(
      (coordinate) => coordinate !== undefined && Number.isFinite(coordinate),
    ),
  )
})

test('LineDashedMaterial projects line-distance dash and gap intervals', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-2, 0, 0, 2, 0, 0], 3))
  const line = new Line(
    geometry,
    new LineDashedMaterial({ color: '#16a34a', dashSize: 1, gapSize: 1 }),
  )
  line.computeLineDistances()
  const scene = new Scene()
  scene.add(line)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(
    projectedLines(result).map(({ x1, x2, stroke }) => [Math.round(x1), Math.round(x2), stroke]),
    [
      [30, 40, '#16a34a'],
      [50, 60, '#16a34a'],
    ],
  )
})

test('invalid or excessive dashed line intervals emit diagnostics', () => {
  for (const material of [
    new LineDashedMaterial({ dashSize: -1 }),
    new LineDashedMaterial({ dashSize: 1, gapSize: 1, scale: 1_000_000 }),
  ]) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3))
    const line = new Line(geometry, material)
    line.computeLineDistances()
    const scene = new Scene()
    scene.add(line)

    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

    assert.deepEqual(result.scene, [])
    assert.ok(
      result.diagnostics[0]?.code === 'UNSUPPORTED_MATERIAL' ||
        result.diagnostics[0]?.code === 'UNSUPPORTED_GEOMETRY',
    )
  }
})

test('Points become Canvas circles with indexed draw ranges and perspective attenuation', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-2, 0, 0, -1, 0, 0, 1, 0, 0], 3))
  geometry.setIndex(new Uint16BufferAttribute([0, 1, 2], 1))
  geometry.setDrawRange(1, 2)
  const scene = new Scene()
  scene.add(new Points(geometry, new PointsMaterial({ color: '#0891b2', size: 2 })))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedCircles(result), [
    { cx: 40, cy: 50, radius: 10, fill: '#0891b2' },
    { cx: 60, cy: 50, radius: 10, fill: '#0891b2' },
  ])
})

test('PointsMaterial can keep a fixed screen-space size', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -4], 3))
  const scene = new Scene()
  scene.add(new Points(geometry, new PointsMaterial({ size: 4, sizeAttenuation: false })))

  const circles = projectedCircles(
    projectThreeScene(scene, perspective(), { width: 100, height: 100 }),
  )

  assert.equal(circles.length, 2)
  assert.ok(circles.every(({ radius }) => radius === 2))
})

test('points outside the homogeneous clip volume are omitted', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, -2, 0, 0, 1], 3))
  const scene = new Scene()
  scene.add(new Points(geometry, new PointsMaterial()))
  const camera = new PerspectiveCamera(90, 1, 1, 10)

  const circles = projectedCircles(projectThreeScene(scene, camera, { width: 100, height: 100 }))

  assert.equal(circles.length, 1)
  assert.equal(circles[0]?.cx, 50)
  assert.equal(circles[0]?.cy, 50)
})

test('PointsMaterial multiplies per-point RGB colours', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3))
  geometry.setAttribute('color', new Float32BufferAttribute([1, 0, 0, 0, 0, 1], 3))
  const scene = new Scene()
  scene.add(
    new Points(
      geometry,
      new PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, vertexColors: true }),
    ),
  )

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(
    projectedCircles(result).map(({ fill }) => fill),
    ['#ff0000', '#0000ff'],
  )
})

test('PointsMaterial map becomes a portable point-sprite texture', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
  const texture = new Texture()
  texture.source.data = '/particle.png'
  texture.colorSpace = THREE.SRGBColorSpace
  const scene = new Scene()
  scene.add(
    new Points(
      geometry,
      new PointsMaterial({ map: texture, size: 4, sizeAttenuation: false, transparent: true }),
    ),
  )

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedMeshes(result), [
    {
      indices: [0, 1, 2, 0, 2, 3],
      texture: {
        source: '/particle.png',
        coordinates: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        filter: 'linear',
      },
      vertices: [
        { x: 48, y: 48 },
        { x: 52, y: 48 },
        { x: 52, y: 52 },
        { x: 48, y: 52 },
      ],
    },
  ])
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

test('InstancedMesh applies each instance transform and preserves object identity', () => {
  const mesh = new THREE.InstancedMesh(
    triangleGeometry(),
    new MeshBasicMaterial({ color: '#2563eb' }),
    2,
  )
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-1, 0, 0))
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0))
  const scene = new Scene()
  scene.add(mesh)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(
    projectedPaths(result).map(({ path }) => path),
    ['M 30 60 L 50 60 L 40 40 Z', 'M 50 60 L 70 60 L 60 40 Z'],
  )
  assert.deepEqual(result.objects, [mesh, mesh])

  mesh.count = 1
  assert.equal(projectThreeScene(scene, perspective(), { width: 100, height: 100 }).scene.length, 1)
})

test('InstancedMesh applies per-instance colours and morph weights', () => {
  const geometry = triangleGeometry()
  geometry.morphAttributes.position = [new Float32BufferAttribute([-1, 1, 0, 1, 1, 0, 0, 3, 0], 3)]
  const mesh = new THREE.InstancedMesh(geometry, new MeshBasicMaterial(), 2)
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-1, 0, 0))
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0))
  mesh.setColorAt(0, new THREE.Color('#ff0000'))
  mesh.setColorAt(1, new THREE.Color('#0000ff'))
  const morphTarget = new Mesh(geometry)
  if (!morphTarget.morphTargetInfluences)
    throw new Error('mesh did not initialise morph influences')
  morphTarget.morphTargetInfluences[0] = 0
  mesh.setMorphAt(0, morphTarget)
  morphTarget.morphTargetInfluences[0] = 1
  mesh.setMorphAt(1, morphTarget)
  const scene = new Scene()
  scene.add(mesh)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedPaths(result), [
    { path: 'M 30 60 L 50 60 L 40 40 Z', fill: '#ff0000' },
    { path: 'M 50 40 L 70 40 L 60 20 Z', fill: '#0000ff' },
  ])
})

test('mirrored mesh transforms preserve Three.js front-face semantics', () => {
  const mesh = new Mesh(triangleGeometry(), new MeshBasicMaterial())
  mesh.scale.x = -1
  const scene = new Scene()
  scene.add(mesh)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.equal(result.scene.length, 1)
})

test('SkinnedMesh evaluates morph targets before public CPU bone transforms', () => {
  const geometry = triangleGeometry()
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  )
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  )
  geometry.morphTargetsRelative = true
  geometry.morphAttributes.position = [new Float32BufferAttribute([0, 2, 0, 0, 2, 0, 0, 2, 0], 3)]
  const mesh = new THREE.SkinnedMesh(geometry, new MeshBasicMaterial())
  const bone = new THREE.Bone()
  mesh.add(bone)
  mesh.bind(new THREE.Skeleton([bone]))
  if (!mesh.morphTargetInfluences) throw new Error('skinned mesh did not initialise morphs')
  mesh.morphTargetInfluences[0] = 0.5
  bone.position.x = 1
  const scene = new Scene()
  scene.add(mesh)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedPaths(result), [{ path: 'M 50 50 L 70 50 L 60 30 Z', fill: '#ffffff' }])
  assert.deepEqual(result.objects, [mesh])
})

test('LOD selects the camera-distance level and honours manual visibility', () => {
  const near = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#ff0000' }))
  const far = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#0000ff' }))
  const lod = new THREE.LOD()
  lod.addLevel(near, 0)
  lod.addLevel(far, 6)
  const scene = new Scene()
  scene.add(lod)
  const camera = perspective()

  assert.deepEqual(
    projectedPaths(projectThreeScene(scene, camera, { width: 100, height: 100 })).map(
      ({ fill }) => fill,
    ),
    ['#ff0000'],
  )

  camera.position.z = 7
  assert.deepEqual(
    projectedPaths(projectThreeScene(scene, camera, { width: 100, height: 100 })).map(
      ({ fill }) => fill,
    ),
    ['#0000ff'],
  )

  lod.autoUpdate = false
  near.visible = true
  far.visible = false
  assert.deepEqual(
    projectedPaths(projectThreeScene(scene, camera, { width: 100, height: 100 })).map(
      ({ fill }) => fill,
    ),
    ['#ff0000'],
  )
})

test('Sprite projects its billboard centre, rotation, and perspective attenuation', () => {
  const material = new THREE.SpriteMaterial({ color: '#16a34a' })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(2, 2, 1)
  const scene = new Scene()
  scene.add(sprite)
  const camera = perspective()
  const path = () =>
    projectedPaths(projectThreeScene(scene, camera, { width: 100, height: 100 }))[0]?.path

  assert.equal(path(), 'M 40 60 L 60 60 L 60 40 L 40 40 Z')

  material.rotation = Math.PI / 2
  assert.equal(path(), 'M 60 60 L 60 40 L 40 40 L 40 60 Z')

  material.rotation = 0
  sprite.center.set(0, 0)
  assert.equal(path(), 'M 50 50 L 70 50 L 70 30 L 50 30 Z')

  sprite.center.set(0.5, 0.5)
  material.sizeAttenuation = false
  assert.equal(path(), 'M 0 0 L 0 100 L 100 100 L 100 0 Z')

  sprite.count = 0
  assert.equal(projectThreeScene(scene, camera, { width: 100, height: 100 }).scene.length, 0)
})

test('SpriteMaterial map preserves billboard UVs through clipping', () => {
  const texture = new Texture()
  texture.source.data = '/sprite.png'
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)],
      map: texture,
    }),
  )
  sprite.scale.set(2, 2, 1)

  const result = projectThreeScene(new Scene().add(sprite), perspective(), {
    width: 100,
    height: 100,
  })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedMeshes(result), [
    {
      indices: [0, 1, 2, 0, 2, 3],
      texture: {
        source: '/sprite.png',
        coordinates: [
          { x: 0.5, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 0 },
          { x: 0.5, y: 0 },
        ],
        filter: 'linear',
      },
      vertices: [
        { x: 50, y: 60 },
        { x: 60, y: 60 },
        { x: 60, y: 40 },
        { x: 50, y: 40 },
      ],
    },
  ])
})

test('Sprite clipping planes cut billboards and preserve disjoint union regions', () => {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)],
      color: '#16a34a',
    }),
  )
  sprite.scale.set(2, 2, 1)

  const clipped = projectThreeScene(new Scene().add(sprite), perspective(), {
    width: 100,
    height: 100,
  })
  assert.deepEqual(clipped.diagnostics, [])
  assert.deepEqual(projectedPaths(clipped), [
    { path: 'M 50 60 L 60 60 L 60 40 L 50 40 Z', fill: '#16a34a' },
  ])

  sprite.material.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.5),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), -0.5),
  ]
  sprite.material.clipIntersection = true
  const union = projectThreeScene(new Scene().add(sprite), perspective(), {
    width: 100,
    height: 100,
  })
  assert.deepEqual(union.diagnostics, [])
  assert.deepEqual(projectedPaths(union), [
    { path: 'M 55 60 L 60 60 L 60 40 L 55 40 Z', fill: '#16a34a' },
    { path: 'M 40 60 L 45 60 L 45 40 L 40 40 Z', fill: '#16a34a' },
  ])
})

test('unsupported SpriteMaterial features are omitted with diagnostics', () => {
  const materials = [
    new THREE.SpriteMaterial({ map: new Texture() }),
    new THREE.SpriteMaterial({ depthTest: false }),
  ]

  for (const material of materials) {
    const scene = new Scene()
    scene.add(new THREE.Sprite(material))
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.scene, [])
    assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  }

  const sprite = new THREE.Sprite()
  sprite.material = new MeshBasicMaterial() as unknown as THREE.SpriteMaterial
  const scene = new Scene()
  scene.add(sprite)
  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
  assert.deepEqual(result.scene, [])
  assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
})

test('BatchedMesh projects sparse visible instances with transforms and colours', () => {
  const batch = new THREE.BatchedMesh(4, 3, 6, new MeshBasicMaterial({ color: '#ffffff' }))
  const geometry = batch.addGeometry(triangleGeometry())
  const left = batch.addInstance(geometry)
  const deleted = batch.addInstance(geometry)
  const right = batch.addInstance(geometry)
  batch.setMatrixAt(left, new THREE.Matrix4().makeTranslation(-1, 0, 0))
  batch.setMatrixAt(right, new THREE.Matrix4().makeTranslation(1, 0, 0))
  batch.setColorAt(right, new THREE.Color('#ff0000'))
  batch.deleteInstance(deleted)
  const scene = new Scene()
  scene.add(batch)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedPaths(result), [
    { path: 'M 30 60 L 50 60 L 40 40 Z', fill: '#ffffff' },
    { path: 'M 50 60 L 70 60 L 60 40 Z', fill: '#ff0000' },
  ])
  assert.deepEqual(result.objects, [batch, batch])

  batch.setVisibleAt(left, false)
  assert.deepEqual(
    projectedPaths(projectThreeScene(scene, perspective(), { width: 100, height: 100 })),
    [{ path: 'M 50 60 L 70 60 L 60 40 Z', fill: '#ff0000' }],
  )
})

test('ArrayCamera projects each sub-camera into its bottom-left viewport', () => {
  const scene = new Scene()
  scene.background = new THREE.Color('#123456')
  const mesh = new Mesh(triangleGeometry(), new MeshBasicMaterial())
  scene.add(mesh)
  const bottomLeft = perspective()
  bottomLeft.viewport = new THREE.Vector4(0, 0, 50, 50)
  const topRight = perspective()
  topRight.viewport = new THREE.Vector4(50, 50, 50, 50)
  const camera = new THREE.ArrayCamera([bottomLeft, topRight])

  const result = projectThreeScene(scene, camera, { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(result.scene, [
    {
      kind: 'rect',
      props: { x: 0, y: 0, width: 100, height: 100, fill: '#123456' },
    },
    {
      kind: 'group',
      props: { transform: { translateX: 0, translateY: 50 } },
      children: [{ kind: 'path', props: { path: 'M 20 30 L 30 30 L 25 20 Z', fill: '#ffffff' } }],
    },
    {
      kind: 'group',
      props: { transform: { translateX: 50, translateY: 0 } },
      children: [{ kind: 'path', props: { path: 'M 20 30 L 30 30 L 25 20 Z', fill: '#ffffff' } }],
    },
  ])
  assert.deepEqual(result.objects, [undefined, mesh, mesh])
})

test('ArrayCamera diagnoses sub-cameras without a viewport', () => {
  const scene = new Scene()
  scene.add(new Mesh(triangleGeometry(), new MeshBasicMaterial()))
  const result = projectThreeScene(scene, new THREE.ArrayCamera([perspective()]), {
    width: 100,
    height: 100,
  })

  assert.deepEqual(result.scene, [])
  assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_CAMERA')
})

test('line morph targets deform projected segments', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3))
  geometry.morphAttributes.position = [new Float32BufferAttribute([-1, 2, 0, 1, 2, 0], 3)]
  const line = new Line(geometry, new LineBasicMaterial())
  if (!line.morphTargetInfluences) throw new Error('line did not initialise morph influences')
  line.morphTargetInfluences[0] = 0.5
  const scene = new Scene()
  scene.add(line)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(projectedLines(result), [
    { x1: 40, y1: 40, x2: 60, y2: 40, stroke: '#ffffff', strokeWidth: 1 },
  ])
})

test('unsupported mesh material classes emit diagnostics', () => {
  const materials = [
    new THREE.MeshDepthMaterial(),
    new THREE.MeshDistanceMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshMatcapMaterial(),
    new THREE.MeshNormalMaterial(),
    new THREE.MeshPhongMaterial(),
    new THREE.MeshPhysicalMaterial(),
    new THREE.MeshStandardMaterial(),
    new THREE.MeshToonMaterial(),
    new THREE.RawShaderMaterial(),
    new THREE.ShaderMaterial(),
    new THREE.ShadowMaterial(),
  ]

  for (const material of materials) {
    const scene = new Scene()
    scene.add(new Mesh(triangleGeometry(), material))
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.scene, [])
    assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL', material.type)
  }
})

test('unsupported MeshBasicMaterial features emit diagnostics', () => {
  const materials = [
    new MeshBasicMaterial({ map: new Texture() }),
    new MeshBasicMaterial({ vertexColors: true, wireframe: true }),
  ]

  for (const material of materials) {
    const scene = new Scene()
    scene.add(new Mesh(triangleGeometry(), material))
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.scene, [])
    assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  }

  const missingColors = projectThreeScene(
    new Scene().add(new Mesh(triangleGeometry(), new MeshBasicMaterial({ vertexColors: true }))),
    perspective(),
    { width: 100, height: 100 },
  )
  assert.deepEqual(missingColors.scene, [])
  assert.equal(missingColors.diagnostics[0]?.code, 'UNSUPPORTED_GEOMETRY')
})

test('material clipping planes cut meshes and lines and discard points in world space', () => {
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
  const mesh = new Mesh(triangleGeometry(), new MeshBasicMaterial({ clippingPlanes: [plane] }))
  const line = new Line(
    new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3),
    ),
    new LineBasicMaterial({ clippingPlanes: [plane] }),
  )
  line.position.x = 1
  const points = new Points(
    new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3),
    ),
    new PointsMaterial({ clippingPlanes: [plane], size: 2, sizeAttenuation: false }),
  )

  const meshResult = projectThreeScene(new Scene().add(mesh), perspective(), {
    width: 100,
    height: 100,
  })
  const lineResult = projectThreeScene(new Scene().add(line), perspective(), {
    width: 100,
    height: 100,
  })
  const pointResult = projectThreeScene(new Scene().add(points), perspective(), {
    width: 100,
    height: 100,
  })
  assert.deepEqual(meshResult.diagnostics, [])
  assert.deepEqual(projectedPaths(meshResult), [
    { path: 'M 50 40 L 50 60 L 60 60 Z', fill: '#ffffff' },
  ])
  assert.deepEqual(projectedLines(lineResult), [
    { x1: 50, y1: 50, x2: 70, y2: 50, stroke: '#ffffff', strokeWidth: 1 },
  ])
  assert.deepEqual(projectedCircles(pointResult), [{ cx: 60, cy: 50, radius: 1, fill: '#ffffff' }])
})

test('clipIntersection retains the disjoint union of material half-spaces', () => {
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.5),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), -0.5),
  ]
  const mesh = new Mesh(
    triangleGeometry(),
    new MeshBasicMaterial({ clipIntersection: true, clippingPlanes: planes }),
  )
  const line = new Line(
    new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3),
    ),
    new LineBasicMaterial({ clipIntersection: true, clippingPlanes: planes }),
  )
  const points = new Points(
    new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute([-1, 0, 0, 0, 0, 0, 1, 0, 0], 3),
    ),
    new PointsMaterial({
      clipIntersection: true,
      clippingPlanes: planes,
      size: 2,
      sizeAttenuation: false,
    }),
  )

  const meshResult = projectThreeScene(new Scene().add(mesh), perspective(), {
    width: 100,
    height: 100,
  })
  const lineResult = projectThreeScene(new Scene().add(line), perspective(), {
    width: 100,
    height: 100,
  })
  const pointResult = projectThreeScene(new Scene().add(points), perspective(), {
    width: 100,
    height: 100,
  })
  const emptyPlaneResult = projectThreeScene(
    new Scene().add(
      new Mesh(triangleGeometry(), new MeshBasicMaterial({ clipIntersection: true })),
    ),
    perspective(),
    { width: 100, height: 100 },
  )

  assert.deepEqual(meshResult.diagnostics, [])
  assert.deepEqual(projectedPaths(meshResult), [
    { path: 'M 55 60 L 60 60 L 55 50 Z', fill: '#ffffff' },
    { path: 'M 45 50 L 40 60 L 45 60 Z', fill: '#ffffff' },
  ])
  assert.deepEqual(projectedLines(lineResult), [
    { x1: 55.00000000000001, y1: 50, x2: 60, y2: 50, stroke: '#ffffff', strokeWidth: 1 },
    { x1: 40, y1: 50, x2: 45, y2: 50, stroke: '#ffffff', strokeWidth: 1 },
  ])
  assert.deepEqual(projectedCircles(pointResult), [
    { cx: 40, cy: 50, radius: 1, fill: '#ffffff' },
    { cx: 60, cy: 50, radius: 1, fill: '#ffffff' },
  ])
  assert.deepEqual(projectedPaths(emptyPlaneResult), [
    { path: 'M 40 60 L 60 60 L 50 40 Z', fill: '#ffffff' },
  ])
})

test('normal transparent materials project opacity across portable primitives', () => {
  const scene = new Scene()
  scene.add(
    new Mesh(
      triangleGeometry(),
      new MeshBasicMaterial({ color: '#ff0000', opacity: 0.25, transparent: true }),
    ),
    new Line(
      new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3),
      ),
      new LineBasicMaterial({ opacity: 0.5, transparent: true }),
    ),
    new Points(
      new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3)),
      new PointsMaterial({ opacity: 0.75, size: 2, sizeAttenuation: false, transparent: true }),
    ),
    new THREE.Sprite(new THREE.SpriteMaterial({ opacity: 0.4 })),
  )

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.deepEqual(
    result.scene.map((node) => ('opacity' in node.props ? node.props.opacity : undefined)),
    [0.25, 0.5, 0.75, 0.4],
  )
})

test('uniform alphaTest omits every supported primitive only below its threshold', () => {
  const projectedCount = (opacity: number, alphaTest: number) => {
    const scene = new Scene()
    scene.add(
      new Mesh(
        triangleGeometry(),
        new MeshBasicMaterial({ alphaTest, opacity, transparent: true }),
      ),
      new Line(
        new BufferGeometry().setAttribute(
          'position',
          new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3),
        ),
        new LineBasicMaterial({ alphaTest, opacity, transparent: true }),
      ),
      new Points(
        new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3)),
        new PointsMaterial({ alphaTest, opacity, size: 2, sizeAttenuation: false }),
      ),
      new THREE.Sprite(new THREE.SpriteMaterial({ alphaTest, opacity })),
    )
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.diagnostics, [])
    return result.scene.length
  }

  assert.equal(projectedCount(0.49, 0.5), 0)
  assert.equal(projectedCount(0.5, 0.5), 4, 'Three.js discards below, not at, alphaTest')
})

test('RGBA vertex attributes diagnose instead of silently dropping alpha', () => {
  const rgbaGeometry = () => {
    const geometry = triangleGeometry()
    geometry.setAttribute(
      'color',
      new Float32BufferAttribute([1, 0, 0, 0.25, 0, 1, 0, 0.5, 0, 0, 1, 0.75], 4),
    )
    return geometry
  }
  const objects = [
    new Mesh(rgbaGeometry(), new MeshBasicMaterial({ vertexColors: true })),
    new Line(rgbaGeometry(), new LineBasicMaterial({ vertexColors: true })),
    new Points(rgbaGeometry(), new PointsMaterial({ vertexColors: true })),
  ]

  for (const object of objects) {
    const result = projectThreeScene(new Scene().add(object), perspective(), {
      width: 100,
      height: 100,
    })
    assert.deepEqual(result.scene, [])
    assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_GEOMETRY')
    assert.match(result.diagnostics[0]?.message ?? '', /alpha/)
  }
})

test('transparent primitives paint after opaque primitives', () => {
  const scene = new Scene()
  const transparentFar = new Mesh(
    triangleGeometry(),
    new MeshBasicMaterial({ color: '#ff0000', opacity: 0.5, transparent: true }),
  )
  transparentFar.position.z = -1
  const opaqueNear = new Mesh(triangleGeometry(), new MeshBasicMaterial({ color: '#0000ff' }))
  opaqueNear.position.z = 1
  scene.add(transparentFar, opaqueNear)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(
    projectedPaths(result).map(({ fill }) => fill),
    ['#0000ff', '#ff0000'],
  )
})

test('non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics', () => {
  const materials = [
    new MeshBasicMaterial({ depthTest: false }),
    new MeshBasicMaterial({ depthWrite: false }),
    new MeshBasicMaterial({ depthFunc: THREE.AlwaysDepth }),
    new MeshBasicMaterial({ stencilWrite: true }),
    new MeshBasicMaterial({ colorWrite: false }),
    new MeshBasicMaterial({ polygonOffset: true }),
    new MeshBasicMaterial({ blending: THREE.AdditiveBlending }),
    new MeshBasicMaterial({ alphaHash: true }),
    new MeshBasicMaterial({ alphaToCoverage: true }),
    new MeshBasicMaterial({ dithering: true }),
  ]
  const invalidAlphaTest = new MeshBasicMaterial()
  invalidAlphaTest.alphaTest = Number.NaN
  materials.push(invalidAlphaTest)

  for (const material of materials) {
    const scene = new Scene()
    scene.add(new Mesh(triangleGeometry(), material))
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.scene, [])
    assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  }

  for (const object of [
    new Line(triangleGeometry(), new LineBasicMaterial({ depthTest: false })),
    new Points(triangleGeometry(), new PointsMaterial({ depthTest: false })),
  ]) {
    const scene = new Scene()
    scene.add(object)
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.scene, [])
    assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  }
})

test('absolute and relative mesh morph targets deform projected triangles', () => {
  for (const relative of [false, true]) {
    const geometry = triangleGeometry()
    geometry.morphTargetsRelative = relative
    geometry.morphAttributes.position = [
      new Float32BufferAttribute(
        relative ? [2, 0, 0, 2, 0, 0, 2, 0, 0] : [1, -1, 0, 3, -1, 0, 2, 1, 0],
        3,
      ),
    ]
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    if (!mesh.morphTargetInfluences) throw new Error('mesh did not initialise morph influences')
    mesh.morphTargetInfluences[0] = 0.5
    const scene = new Scene()
    scene.add(mesh)
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

    assert.deepEqual(result.diagnostics, [])
    assert.equal(projectedPaths(result)[0]?.path, 'M 50 60 L 70 60 L 60 40 Z')
  }
})

test('point morph targets move projected points', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
  geometry.morphAttributes.position = [new Float32BufferAttribute([2, 0, 0], 3)]
  const points = new Points(geometry, new PointsMaterial({ size: 2, sizeAttenuation: false }))
  if (!points.morphTargetInfluences) throw new Error('points did not initialise morph influences')
  points.morphTargetInfluences[0] = 0.5
  const scene = new Scene()
  scene.add(points)

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.diagnostics, [])
  assert.equal(projectedCircles(result)[0]?.cx, 60)
})

test('unsupported inputs are omitted with actionable diagnostics', () => {
  const scene = new Scene()
  const material = new MeshBasicMaterial({ color: '#ffffff', map: new Texture() })
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
