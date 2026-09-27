import { Canvas, type CanvasPressEvent, type CanvasProps } from '@hozo/canvas'
import { type Ref, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  type Intersection,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  Raycaster,
  Vector2,
} from 'three'

import { projectThreeScene, type ThreeProjectionDiagnostic } from './project.ts'
import {
  resizeThreeCamera,
  type ThreeSurfaceFrame,
  type ThreeSurfaceFrameloop,
  type ThreeSurfaceHandle,
  type ThreeSurfaceProps,
  useThreeSurfaceLifecycle,
  useThreeSurfaceSize,
} from './surface.ts'

export type ThreeCanvasCamera = PerspectiveCamera | OrthographicCamera
export type ThreeCanvasFrameloop = ThreeSurfaceFrameloop
export type ThreeCanvasFrame = ThreeSurfaceFrame<ThreeCanvasCamera>

export interface ThreeCanvasObjectEvent {
  /** The 2D activation that reached the projected object. */
  canvasEvent: CanvasPressEvent
  /** The nearest Three.js intersection for this object, when one exists. */
  intersection?: Intersection<Object3D>
  /** All intersections with this object, nearest first. */
  intersections: readonly Intersection<Object3D>[]
  object: Object3D
}

export type ThreeCanvasHandle = ThreeSurfaceHandle

type CanvasSurfaceProps = CanvasProps extends infer Variant
  ? Variant extends CanvasProps
    ? Omit<Variant, 'children' | 'fit' | 'height' | 'onSizeChange' | 'viewBox' | 'width'>
    : never
  : never

export type ThreeCanvasProps = CanvasSurfaceProps &
  ThreeSurfaceProps<ThreeCanvasCamera> & {
    onDiagnostic?: (diagnostic: ThreeProjectionDiagnostic) => void
    /** Name an interactive Three object for its single keyboard control. */
    getAccessibilityLabel?: (object: Object3D) => string | undefined
    /** Activated after the projected path identifies an object. */
    onObjectPress?: (event: ThreeCanvasObjectEvent) => void
    /** Reports hover, focus, and touch-hold as one object-level state. */
    onObjectActiveChange?: (event: ThreeCanvasObjectEvent | undefined) => void
    /** Optional configured raycaster; a package-owned instance is used otherwise. */
    raycaster?: Raycaster
    ref?: Ref<ThreeCanvasHandle>
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
  cameraResize = 'auto',
  frameloop = 'demand',
  getAccessibilityLabel,
  height,
  onDiagnostic,
  onFrame,
  onObjectActiveChange,
  onObjectPress,
  onResize,
  raycaster: providedRaycaster,
  ref,
  revision,
  scene,
  width,
  ...canvasProps
}: ThreeCanvasProps) {
  const raycasterRef = useRef<Raycaster | null>(null)
  const { frameRevision } = useThreeSurfaceLifecycle({
    camera,
    frameloop,
    onFrame,
    ref,
    scene,
  })
  const { measure, size } = useThreeSurfaceSize({ height, onResize, width })

  const projection = useMemo(() => {
    // These are explicit invalidation tokens. Their values do not enter the
    // projection, but changing either means the mutable Three objects did.
    void frameRevision
    void revision
    resizeThreeCamera(camera, size, cameraResize)
    return projectThreeScene(scene, camera, size)
  }, [camera, cameraResize, frameRevision, revision, scene, size])

  useEffect(() => {
    if (!onDiagnostic) return
    for (const diagnostic of projection.diagnostics) onDiagnostic(diagnostic)
  }, [onDiagnostic, projection])

  const objectEvent = useCallback(
    (object: Object3D, canvasEvent: CanvasPressEvent): ThreeCanvasObjectEvent => {
      const raycaster = providedRaycaster ?? (raycasterRef.current ??= new Raycaster())
      raycaster.setFromCamera(
        new Vector2(
          (canvasEvent.point.x / size.width) * 2 - 1,
          1 - (canvasEvent.point.y / size.height) * 2,
        ),
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
    [camera, providedRaycaster, size],
  )

  return (
    <Canvas
      {...canvasProps}
      width={width}
      height={height}
      viewBox={[0, 0, size.width, size.height]}
      onSizeChange={measure}
    >
      {projection.scene.map((node, index) => {
        const object = projection.objects[index]
        const interaction = object
          ? {
              accessibilityControlId: object.uuid,
              accessibilityLabel:
                getAccessibilityLabel?.(object) ?? (object.name.trim() || undefined),
              onActiveChange: onObjectActiveChange
                ? (event: CanvasPressEvent | undefined) =>
                    onObjectActiveChange(
                      event === undefined ? undefined : objectEvent(object, event),
                    )
                : undefined,
              onPress: onObjectPress
                ? (event: CanvasPressEvent) => onObjectPress(objectEvent(object, event))
                : undefined,
            }
          : {}
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
        if (node.kind === 'triangle-mesh') {
          return (
            <Canvas.TriangleMesh
              // biome-ignore lint/suspicious/noArrayIndexKey: projected primitives have no durable Three identity, and every Canvas shape is a stateless scene registration
              key={`${index}:triangle-mesh`}
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
        if (node.kind === 'rect') {
          return (
            <Canvas.Rect
              // biome-ignore lint/suspicious/noArrayIndexKey: projected primitives have no durable Three identity, and every Canvas shape is a stateless scene registration
              key={`${index}:rect`}
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
