import type { CanvasAccessibilityProps } from '@hozo/canvas'
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Camera, Intersection, Object3D, Raycaster, Scene, Vector2 } from 'three'

import {
  type ThreeSurfaceFrame,
  type ThreeSurfaceFrameloop,
  type ThreeSurfaceHandle,
  useThreeSurfaceLifecycle,
} from './surface.ts'

export type ThreeCanvasFrameloop = ThreeSurfaceFrameloop
export type ThreeCanvasFrame = ThreeSurfaceFrame<Camera>
export type ThreeCanvasHandle = ThreeSurfaceHandle

export interface ThreeCanvasObjectEvent {
  intersection?: Intersection<Object3D>
  intersections: readonly Intersection<Object3D>[]
  object: Object3D
}

export interface ThreeWebRenderer {
  dispose(): void
  render(scene: Scene, camera: Camera): Promise<void> | void
  setPixelRatio(value: number): void
  setSize(width: number, height: number, updateStyle: boolean): void
}

type CanvasElementProps = Omit<
  ComponentPropsWithoutRef<'canvas'>,
  'aria-label' | 'children' | 'height' | 'ref' | 'role' | 'width'
>

export type ThreeWebCanvasProps<TRenderer extends ThreeWebRenderer> = CanvasAccessibilityProps &
  CanvasElementProps & {
    camera: Camera
    createRaycaster: () => Raycaster
    createRenderer: (canvas: HTMLCanvasElement) => Promise<TRenderer> | TRenderer
    frameloop?: ThreeCanvasFrameloop
    /** Name an interactive Three object for its keyboard and screen-reader control. */
    getAccessibilityLabel?: (object: Object3D) => string | undefined
    height: number
    onCreated?: (renderer: TRenderer) => void
    onError?: (error: unknown) => void
    onFrame?: (frame: ThreeCanvasFrame) => void
    /** Reports hover and semantic-control focus as one object-level state. */
    onObjectActiveChange?: (event: ThreeCanvasObjectEvent | undefined) => void
    /** Activated after raycasting or a semantic control identifies an object. */
    onObjectPress?: (event: ThreeCanvasObjectEvent) => void
    /** Defaults to the current device pixel ratio. */
    pixelRatio?: number
    /** Optional configured raycaster; a package-owned instance is used otherwise. */
    raycaster?: Raycaster
    ref?: Ref<ThreeCanvasHandle>
    revision?: unknown
    scene: Scene
    width: number
  }

const accessibleOnlyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/** Renderer-neutral DOM, lifecycle, raycast, and semantic layer for Web families. */
export function ThreeWebCanvas<TRenderer extends ThreeWebRenderer>({
  accessibilityLabel,
  accessibleFallback,
  camera,
  createRaycaster,
  createRenderer,
  decorative,
  frameloop = 'demand',
  getAccessibilityLabel,
  height,
  onCreated,
  onError,
  onFrame,
  onObjectActiveChange,
  onObjectPress,
  onPointerCancel,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  pixelRatio,
  raycaster: providedRaycaster,
  ref,
  revision,
  scene,
  style,
  width,
  ...canvasProps
}: ThreeWebCanvasProps<TRenderer>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raycasterRef = useRef<Raycaster | null>(null)
  const pressedObjects = useRef(new Map<number, Object3D>())
  const activeObject = useRef<Object3D | undefined>(undefined)
  const createdCallback = useRef(onCreated)
  const errorCallback = useRef(onError)
  const [renderer, setRenderer] = useState<TRenderer>()
  const [creationError, setCreationError] = useState<unknown>()
  const { frameRevision } = useThreeSurfaceLifecycle({
    camera,
    frameloop,
    onFrame,
    ref,
    scene,
  })
  createdCallback.current = onCreated
  errorCallback.current = onError

  const objectEvent = useCallback(
    (object: Object3D, intersections: readonly Intersection<Object3D>[] = []) => ({
      intersection: intersections[0],
      intersections,
      object,
    }),
    [],
  )

  const raycast = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect()
      const x = ((event.clientX - bounds.left) / (bounds.width || width || 1)) * 2 - 1
      const y = 1 - ((event.clientY - bounds.top) / (bounds.height || height || 1)) * 2
      const raycaster = providedRaycaster ?? (raycasterRef.current ??= createRaycaster())
      raycaster.layers.mask = camera.layers.mask
      raycaster.setFromCamera({ x, y } as Vector2, camera)
      return raycaster
        .intersectObjects(scene.children, true)
        .filter(({ object }) => objectVisible(object))
    },
    [camera, createRaycaster, height, providedRaycaster, scene, width],
  )

  const controls = useMemo(() => {
    void frameRevision
    void revision
    if (!onObjectPress) return []
    const result: { label: string; object: Object3D }[] = []
    scene.traverseVisible((object) => {
      if (!isRenderableObject(object)) return
      if (!object.layers.test(camera.layers)) return
      const label = getAccessibilityLabel?.(object) ?? (object.name.trim() || undefined)
      if (label) result.push({ label, object })
    })
    return result
  }, [camera.layers, frameRevision, getAccessibilityLabel, onObjectPress, revision, scene])

  const setActive = useCallback(
    (event: ThreeCanvasObjectEvent | undefined) => {
      if (activeObject.current === event?.object) return
      activeObject.current = event?.object
      onObjectActiveChange?.(event)
    },
    [onObjectActiveChange],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let nextRenderer: TRenderer | undefined
    Promise.resolve()
      .then(() => createRenderer(canvas))
      .then((createdRenderer) => {
        if (cancelled) {
          createdRenderer.dispose()
          return
        }
        nextRenderer = createdRenderer
        setRenderer(createdRenderer)
        createdCallback.current?.(createdRenderer)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        errorCallback.current?.(error)
        if (!errorCallback.current) setCreationError(error)
      })
    return () => {
      cancelled = true
      setRenderer(undefined)
      nextRenderer?.dispose()
    }
  }, [createRenderer])

  useEffect(() => {
    if (!renderer) return
    // Explicit invalidation tokens: their values do not enter the draw.
    void frameRevision
    void revision
    renderer.setPixelRatio(pixelRatio ?? globalThis.devicePixelRatio ?? 1)
    renderer.setSize(width, height, false)
    try {
      Promise.resolve(renderer.render(scene, camera)).catch((error: unknown) => {
        errorCallback.current?.(error)
        if (!errorCallback.current) setCreationError(error)
      })
    } catch (error) {
      errorCallback.current?.(error)
      if (!errorCallback.current) setCreationError(error)
    }
  }, [camera, frameRevision, height, pixelRatio, renderer, revision, scene, width])

  if (creationError !== undefined) throw creationError

  const hasFallback = accessibleFallback !== undefined
  const labelled = !decorative && !hasFallback
  return (
    <>
      <canvas
        {...canvasProps}
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width, height, ...style }}
        aria-hidden={labelled ? undefined : true}
        aria-label={labelled ? accessibilityLabel : undefined}
        role={labelled ? 'img' : undefined}
        onPointerDown={(event) => {
          const intersection = raycast(event)[0]
          if (intersection) pressedObjects.current.set(event.pointerId, intersection.object)
          onPointerDown?.(event)
        }}
        onPointerUp={(event) => {
          const intersections = raycast(event)
          const intersection = intersections[0]
          const pressed = pressedObjects.current.get(event.pointerId)
          pressedObjects.current.delete(event.pointerId)
          if (intersection && pressed === intersection.object) {
            const matching = intersections.filter(({ object }) => object === intersection.object)
            onObjectPress?.(objectEvent(intersection.object, matching))
          }
          onPointerUp?.(event)
        }}
        onPointerCancel={(event) => {
          pressedObjects.current.delete(event.pointerId)
          onPointerCancel?.(event)
        }}
        onPointerMove={(event) => {
          const intersections = raycast(event)
          const intersection = intersections[0]
          setActive(
            intersection
              ? objectEvent(
                  intersection.object,
                  intersections.filter(({ object }) => object === intersection.object),
                )
              : undefined,
          )
          onPointerMove?.(event)
        }}
        onPointerLeave={(event) => {
          setActive(undefined)
          onPointerLeave?.(event)
        }}
      />
      {controls.length > 0 ? (
        <div style={accessibleOnlyStyle} data-hozo-three-controls="">
          {controls.map(({ label, object }) => (
            <button
              key={object.uuid}
              type="button"
              onClick={() => onObjectPress?.(objectEvent(object))}
              onFocus={() => setActive(objectEvent(object))}
              onBlur={() => setActive(undefined)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {hasFallback ? (
        <div
          style={accessibleOnlyStyle}
          role={accessibilityLabel ? 'group' : undefined}
          aria-label={accessibilityLabel}
          data-hozo-three-fallback=""
        >
          {accessibleFallback}
        </div>
      ) : null}
    </>
  )
}

function isRenderableObject(object: Object3D) {
  const renderable = object as Object3D & {
    isLine?: boolean
    isMesh?: boolean
    isPoints?: boolean
    isSprite?: boolean
  }
  return Boolean(
    renderable.isMesh || renderable.isLine || renderable.isPoints || renderable.isSprite,
  )
}

function objectVisible(object: Object3D) {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false
  }
  return true
}
