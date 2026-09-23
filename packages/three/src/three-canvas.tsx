import { Canvas, type CanvasPressEvent, type CanvasProps } from '@hozo/canvas'
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import {
  type Intersection,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  Raycaster,
  type Scene,
  Vector2,
} from 'three'

import { projectThreeScene, type ThreeProjectionDiagnostic } from './project.ts'

export type ThreeCanvasFrameloop = 'demand' | 'always'

export interface ThreeCanvasFrame {
  camera: ThreeCanvasCamera
  /** Seconds since the preceding frame. Zero on the first frame. */
  delta: number
  /** Seconds since this animation loop started. */
  elapsed: number
  scene: Scene
}

export type ThreeCanvasCamera = PerspectiveCamera | OrthographicCamera

export interface ThreeCanvasObjectEvent {
  /** The 2D activation that reached the projected object. */
  canvasEvent: CanvasPressEvent
  /** The nearest Three.js intersection for this object, when one exists. */
  intersection?: Intersection<Object3D>
  /** All intersections with this object, nearest first. */
  intersections: readonly Intersection<Object3D>[]
  object: Object3D
}

export interface ThreeCanvasHandle {
  /** Re-project mutations made to the same Three.js scene and camera objects. */
  invalidate(): void
}

type CanvasSurfaceProps = CanvasProps extends infer Variant
  ? Variant extends CanvasProps
    ? Omit<Variant, 'children' | 'fit' | 'height' | 'viewBox' | 'width'>
    : never
  : never

export type ThreeCanvasProps = CanvasSurfaceProps & {
  camera: ThreeCanvasCamera
  frameloop?: ThreeCanvasFrameloop
  height: number
  onDiagnostic?: (diagnostic: ThreeProjectionDiagnostic) => void
  onFrame?: (frame: ThreeCanvasFrame) => void
  /** Name an interactive Three object for its single keyboard control. */
  getAccessibilityLabel?: (object: Object3D) => string | undefined
  /** Activated after the projected path identifies an object. */
  onObjectPress?: (event: ThreeCanvasObjectEvent) => void
  /** Reports hover, focus, and touch-hold as one object-level state. */
  onObjectActiveChange?: (event: ThreeCanvasObjectEvent | undefined) => void
  /** Optional configured raycaster; a package-owned instance is used otherwise. */
  raycaster?: Raycaster
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
  getAccessibilityLabel,
  height,
  onDiagnostic,
  onFrame,
  onObjectActiveChange,
  onObjectPress,
  raycaster: providedRaycaster,
  ref,
  revision,
  scene,
  width,
  ...canvasProps
}: ThreeCanvasProps) {
  const [frameRevision, invalidateReducer] = useReducer((value: number) => value + 1, 0)
  const invalidate = useCallback(() => invalidateReducer(), [])
  const frameCallback = useRef(onFrame)
  const raycasterRef = useRef<Raycaster | null>(null)
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

  const objectEvent = useCallback(
    (object: Object3D, canvasEvent: CanvasPressEvent): ThreeCanvasObjectEvent => {
      const raycaster = providedRaycaster ?? (raycasterRef.current ??= new Raycaster())
      raycaster.setFromCamera(
        new Vector2((canvasEvent.point.x / width) * 2 - 1, 1 - (canvasEvent.point.y / height) * 2),
        camera,
      )
      const intersections = raycaster.intersectObject(object, false)
      return {
        canvasEvent,
        intersection: intersections[0],
        intersections,
        object,
      }
    },
    [camera, height, providedRaycaster, width],
  )

  return (
    <Canvas {...canvasProps} width={width} height={height} viewBox={[0, 0, width, height]}>
      {projection.scene.map((node, index) => {
        const object = projection.objects[index]
        if (!object) return null
        const accessibilityLabel =
          getAccessibilityLabel?.(object) ?? (object.name.trim() || undefined)
        const interaction = {
          accessibilityControlId: object.uuid,
          accessibilityLabel,
          onActiveChange: onObjectActiveChange
            ? (event: CanvasPressEvent | undefined) =>
                onObjectActiveChange(event === undefined ? undefined : objectEvent(object, event))
            : undefined,
          onPress: onObjectPress
            ? (event: CanvasPressEvent) => onObjectPress(objectEvent(object, event))
            : undefined,
        }
        if (node.kind === 'path') {
          return (
            <Canvas.Path
              // biome-ignore lint/suspicious/noArrayIndexKey: projected primitives have no durable Three identity, and every Canvas shape is a stateless scene registration
              key={`${index}:path`}
              {...node.props}
              {...interaction}
            />
          )
        }
        if (node.kind === 'line') {
          return (
            <Canvas.Line
              // biome-ignore lint/suspicious/noArrayIndexKey: projected primitives have no durable Three identity, and every Canvas shape is a stateless scene registration
              key={`${index}:line`}
              {...node.props}
              {...interaction}
            />
          )
        }
        if (node.kind === 'circle') {
          return (
            <Canvas.Circle
              // biome-ignore lint/suspicious/noArrayIndexKey: projected primitives have no durable Three identity, and every Canvas shape is a stateless scene registration
              key={`${index}:circle`}
              {...node.props}
              {...interaction}
            />
          )
        }
        return null
      })}
    </Canvas>
  )
}
