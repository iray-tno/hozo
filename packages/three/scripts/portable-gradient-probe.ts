import { type CanvasScene, renderCanvas2D } from '@hozo/canvas'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { projectThreeScene } from '../src/project.ts'

export interface PortableGradientResult {
  name: string
  passed: boolean
  samples: number
  maxChannelError: number
  baselineMaxChannelError: number
  stops: number
  primitives: number
}

export interface PortableGradientTiming {
  lines: number
  workload: 'cached-scene-draw' | 'animated-projection-and-draw'
  interpolation: 'bounded' | 'endpoints'
  trials: number
  medianMs: number
}

/** Includes host gradient construction and a pixel readback to flush raster work. */
export function probePortableGradientTimings(): PortableGradientTiming[] {
  const results: PortableGradientTiming[] = []
  const width = 256
  const height = 256
  const target = Object.assign(document.createElement('canvas'), { width, height })
  const context = target.getContext('2d', { willReadFrequently: true })!
  for (const lines of [1000, 10000]) {
    const positions: number[] = []
    const colors: number[] = []
    for (let index = 0; index < lines; index += 1) {
      const y = (index % 100) / 100 - 0.5
      positions.push(-1, y, -2, 1, y, -4 - (index % 5))
      colors.push(1, 0, 0, 0, 1, 0)
    }
    const geometry = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(positions, 3))
      .setAttribute('color', new Float32BufferAttribute(colors, 3))
    const material = new LineBasicMaterial({ vertexColors: true })
    const scene = new Scene().add(new LineSegments(geometry, material))
    const camera = new PerspectiveCamera(90, 1, 0.1, 100)
    for (const interpolation of ['endpoints', 'bounded'] as const) {
      for (const workload of ['cached-scene-draw', 'animated-projection-and-draw'] as const) {
        camera.position.z = 0
        const cached = projectThreeScene(scene, camera, {
          width,
          height,
          lineColorInterpolation: interpolation,
        })
        const trials: number[] = []
        for (let trial = 0; trial < 4; trial += 1) {
          const started = performance.now()
          camera.position.z = trial * 0.013
          const projected =
            workload === 'cached-scene-draw'
              ? cached
              : projectThreeScene(scene, camera, {
                  width,
                  height,
                  lineColorInterpolation: interpolation,
                })
          if (projected.scene.length !== lines || projected.diagnostics.length)
            throw new Error('timing fixture lost edges')
          renderCanvas2D(context, projected.scene, { width, height, pixelRatio: 1 })
          context.getImageData(0, 0, width, height)
          if (trial) trials.push(performance.now() - started)
        }
        trials.sort((a, b) => a - b)
        results.push({ lines, workload, interpolation, trials: 3, medianMs: trials[1]! })
      }
    }
    geometry.dispose()
    material.dispose()
  }
  return results
}

/** Compare real Canvas 2D pixels with upstream WebGL, not a second formula. */
export function probePortableGradients(): PortableGradientResult[] {
  const width = 257
  const height = 33
  const renderer = new WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(width, height)
  renderer.setClearColor(0, 0)
  renderer.localClippingEnabled = true
  const target = Object.assign(document.createElement('canvas'), { width, height })
  const context = target.getContext('2d', { willReadFrequently: true })!
  const gl = renderer.getContext()
  const upstream = new Uint8Array(width * height * 4)
  const results: PortableGradientResult[] = []
  try {
    for (const fixture of [
      { name: 'orthographic', depth: 1, orthographic: true },
      ...[1, 2, 16, 100].map((depth) => ({ name: `perspective-${depth}`, depth })),
      { name: 'reversed', depth: 0.01 },
      { name: 'wireframe', depth: 16, wireframe: true },
      { name: 'material-clipped', depth: 4, materialClipped: true },
      { name: 'viewport-clipped', depth: 4, viewportClipped: true },
      { name: 'near-clipped', depth: 4, nearClipped: true },
    ] as Array<{
      name: string
      depth: number
      orthographic?: boolean
      wireframe?: boolean
      materialClipped?: boolean
      viewportClipped?: boolean
      nearClipped?: boolean
    }>) {
      const camera = fixture.orthographic
        ? new OrthographicCamera(-width / height, width / height, 1, -1, 0.1, 1000)
        : new PerspectiveCamera(90, width / height, fixture.nearClipped ? 2 : 0.001, 1000)
      const left = (2 * (fixture.viewportClipped ? -50.5 : 8.5)) / width - 1
      const right = (2 * 248.5) / width - 1
      const positions = [
        left * (width / height),
        0,
        -1,
        right * (width / height) * (fixture.orthographic ? 1 : fixture.depth),
        0,
        -fixture.depth,
      ]
      if (fixture.wireframe) positions.push(0, 0.75, -1)
      const geometry = new BufferGeometry()
        .setAttribute('position', new Float32BufferAttribute(positions, 3))
        .setAttribute(
          'color',
          new Float32BufferAttribute(
            fixture.wireframe ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, 1, 0],
            3,
          ),
        )
      const material = fixture.wireframe
        ? new MeshBasicMaterial({ vertexColors: true, wireframe: true })
        : new LineBasicMaterial({ vertexColors: true })
      if (fixture.materialClipped) material.clippingPlanes = [new Plane(new Vector3(1, 0, 0), 0)]
      const scene = new Scene().add(
        fixture.wireframe
          ? new Mesh(geometry, material)
          : new Line(geometry, material as LineBasicMaterial),
      )
      const projected = projectThreeScene(scene, camera, { width, height })
      if (projected.diagnostics.length) throw new Error(JSON.stringify(projected.diagnostics))
      renderer.render(scene, camera)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, upstream)
      renderCanvas2D(context, projected.scene, { width, height, pixelRatio: 1 })
      const refined = context.getImageData(0, 0, width, height).data
      const baseline: CanvasScene = projected.scene.map((node) => {
        if (node.kind !== 'line' || !node.props.stroke || typeof node.props.stroke === 'string')
          return node
        const stroke = node.props.stroke
        return {
          ...node,
          props: {
            ...node.props,
            stroke: { ...stroke, stops: [stroke.stops[0]!, stroke.stops.at(-1)!] },
          },
        }
      })
      renderCanvas2D(context, baseline, { width, height, pixelRatio: 1 })
      const old = context.getImageData(0, 0, width, height).data
      let maxChannelError = 0
      let baselineMaxChannelError = 0
      let samples = 0
      // Rasterizer endpoint/coverage differences are outside colour fidelity.
      // Require fully covered shared interior pixels, not filtered RGB errors.
      // The other two wireframe edges approach the sampled horizontal edge
      // near the vertices. Keep their antialiased coverage out of this probe.
      for (let x = 32; x < width - 32; x += 1) {
        const offset = (16 * width + x) * 4
        if (upstream[offset + 3] !== 255 || refined[offset + 3] !== 255 || old[offset + 3] !== 255)
          continue
        for (let channel = 0; channel < 3; channel += 1) {
          maxChannelError = Math.max(
            maxChannelError,
            Math.abs(refined[offset + channel]! - upstream[offset + channel]!),
          )
          baselineMaxChannelError = Math.max(
            baselineMaxChannelError,
            Math.abs(old[offset + channel]! - upstream[offset + channel]!),
          )
        }
        samples += 1
      }
      const stops = Math.max(
        ...projected.scene.map((node) =>
          node.kind === 'line' && typeof node.props.stroke === 'object'
            ? node.props.stroke.stops.length
            : 0,
        ),
      )
      results.push({
        name: fixture.name,
        passed: samples >= 20 && maxChannelError <= 3 && maxChannelError < baselineMaxChannelError,
        samples,
        maxChannelError,
        baselineMaxChannelError,
        stops,
        primitives: projected.scene.length,
      })
      geometry.dispose()
      material.dispose()
    }
  } finally {
    renderer.dispose()
  }
  return results
}
