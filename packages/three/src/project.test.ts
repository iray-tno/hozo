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

test('unsupported dashed line materials are omitted with a diagnostic', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3))
  const scene = new Scene()
  scene.add(new Line(geometry, new LineDashedMaterial()))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.scene, [])
  assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  assert.match(result.diagnostics[0]?.message ?? '', /dashed/)
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

test('textured points are omitted with a diagnostic', () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
  const scene = new Scene()
  scene.add(new Points(geometry, new PointsMaterial({ map: new Texture() })))

  const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })

  assert.deepEqual(result.scene, [])
  assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  assert.match(result.diagnostics[0]?.message ?? '', /textured/)
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

test('unsupported mesh variants emit diagnostics', () => {
  const material = new MeshBasicMaterial()
  const objects = [
    new THREE.InstancedMesh(triangleGeometry(), material, 1),
    new THREE.SkinnedMesh(triangleGeometry(), material),
  ]

  for (const object of objects) {
    const scene = new Scene()
    scene.add(object)
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.scene, [])
    assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MESH')
  }
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
    new MeshBasicMaterial({ vertexColors: true }),
    new MeshBasicMaterial({ map: new Texture() }),
    new MeshBasicMaterial({ opacity: 0.5, transparent: true }),
    new MeshBasicMaterial({ clippingPlanes: [new THREE.Plane()] }),
  ]

  for (const material of materials) {
    const scene = new Scene()
    scene.add(new Mesh(triangleGeometry(), material))
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.scene, [])
    assert.equal(result.diagnostics[0]?.code, 'UNSUPPORTED_MATERIAL')
  }
})

test('active mesh and point morph targets emit diagnostics', () => {
  const objects = [
    new Mesh(triangleGeometry(), new MeshBasicMaterial()),
    new Points(triangleGeometry(), new PointsMaterial()),
  ]
  for (const object of objects) object.morphTargetInfluences = [1]

  for (const object of objects) {
    const scene = new Scene()
    scene.add(object)
    const result = projectThreeScene(scene, perspective(), { width: 100, height: 100 })
    assert.deepEqual(result.scene, [])
    assert.ok(
      result.diagnostics[0]?.code === 'UNSUPPORTED_MESH' ||
        result.diagnostics[0]?.code === 'UNSUPPORTED_GEOMETRY',
    )
  }
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
