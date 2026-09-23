import { Canvas, type CanvasProps } from '@hozo/canvas'
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import type { Object3D, Scene } from 'three'

import { projectThreeScene, type ThreeProjectionDiagnostic } from './project.ts'

export type ThreeCanvasFrameloop = 'demand' | 'always'

export interface ThreeCanvasFrame {
  camera: Object3D
  /** Seconds since the preceding frame. Zero on the first frame. */
  delta: number
  /** Seconds since this animation loop started. */
  elapsed: number
  scene: Scene
}

export interface ThreeCanvasHandle {
  /** Re-project mutations made to the same Three.js scene and camera objects. */
  invalidate(): void
}

type CanvasSurfaceProps = CanvasProps extends infer Variant
  ? Variant extends CanvasProps
    ? Omit<Variant, 'children' | 'height' | 'width'>
    : never
  : never

export type ThreeCanvasProps = CanvasSurfaceProps & {
  camera: Object3D
  frameloop?: ThreeCanvasFrameloop
  height: number
  onDiagnostic?: (diagnostic: ThreeProjectionDiagnostic) => void
  onFrame?: (frame: ThreeCanvasFrame) => void
  ref?: Ref<ThreeCanvasHandle>
  /**
   * An application-owned value that invalidates demand rendering when it
   * changes. Useful when an imperative ref is inconvenient.
   */
  revision?: unknown
  scene: Scene
  width: number
}

/**
 * A small React lifecycle around the deterministic Three.js projection.
 *
 * Demand rendering is the default: props, `revision`, or `invalidate()`
 * re-project the scene. `always` uses the platform animation clock and is
 * intended for scenes whose `onFrame` callback mutates Three objects.
 */
export function ThreeCanvas({
  camera,
  frameloop = 'demand',
  height,
  onDiagnostic,
  onFrame,
  ref,
  revision,
  scene,
  width,
  ...canvasProps
}: ThreeCanvasProps) {
  const [frameRevision, invalidateReducer] = useReducer((value: number) => value + 1, 0)
  const invalidate = useCallback(() => invalidateReducer(), [])
  const frameCallback = useRef(onFrame)
  frameCallback.current = onFrame

  useImperativeHandle(ref, () => ({ invalidate }), [invalidate])

  useEffect(() => {
    if (frameloop !== 'always') return
    let request = 0
    let first: number | undefined
    let previous: number | undefined
    const frame = (timestamp: number) => {
      first ??= timestamp
      frameCallback.current?.({
        camera,
        delta: previous === undefined ? 0 : (timestamp - previous) / 1000,
        elapsed: (timestamp - first) / 1000,
        scene,
      })
      previous = timestamp
      invalidate()
      request = requestAnimationFrame(frame)
    }
    request = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(request)
  }, [camera, frameloop, invalidate, scene])

  const projection = useMemo(() => {
    // These are explicit invalidation tokens. Their values do not enter the
    // projection, but changing either means the mutable Three objects did.
    void frameRevision
    void revision
    return projectThreeScene(scene, camera, { width, height })
  }, [camera, frameRevision, height, revision, scene, width])

  useEffect(() => {
    if (!onDiagnostic) return
    for (const diagnostic of projection.diagnostics) onDiagnostic(diagnostic)
  }, [onDiagnostic, projection])

  return (
    <Canvas {...canvasProps} width={width} height={height}>
      {projection.scene.map((node, index) => {
        // The portable 3D subset currently projects triangles only. Keeping
        // this boundary explicit makes adding lines or labels a local change.
        if (node.kind !== 'path') return null
        // biome-ignore lint/suspicious/noArrayIndexKey: projected triangles have no durable Three identity, and every Canvas.Path is a stateless scene registration
        return <Canvas.Path key={`${index}:${node.props.path}`} {...node.props} />
      })}
    </Canvas>
  )
}
