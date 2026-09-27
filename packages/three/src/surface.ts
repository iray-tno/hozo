import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { Camera, Scene } from 'three'

export type ThreeSurfaceFrameloop = 'demand' | 'always'

export interface ThreeSurfaceFrame<TCamera extends Camera = Camera> {
  camera: TCamera
  /** Seconds since the preceding frame. Zero on the first frame. */
  delta: number
  /** Seconds since this animation loop started. */
  elapsed: number
  scene: Scene
}

export interface ThreeSurfaceHandle {
  /** Render mutations made to the same Three.js scene and camera objects. */
  invalidate(): void
}

export interface ThreeSurfaceSize {
  /** Layout pixels (CSS pixels on Web, density-independent pixels on Native). */
  width: number
  /** Layout pixels (CSS pixels on Web, density-independent pixels on Native). */
  height: number
  /** Physical pixels per layout pixel. */
  pixelRatio: number
}

export type ThreeSurfaceCameraResize = 'auto' | 'manual'

export interface ThreeSurfaceProps<TCamera extends Camera = Camera> {
  camera: TCamera
  /** Update a PerspectiveCamera's aspect on resize. Orthographic cameras remain application-owned. */
  cameraResize?: ThreeSurfaceCameraResize
  frameloop?: ThreeSurfaceFrameloop
  /** Fixed layout height. Omit it to follow the mounted surface. */
  height?: number
  onFrame?: (frame: ThreeSurfaceFrame<TCamera>) => void
  onResize?: (size: ThreeSurfaceSize) => void
  ref?: Ref<ThreeSurfaceHandle>
  /**
   * An application-owned value that invalidates demand rendering when it
   * changes. Useful when an imperative ref is inconvenient.
   */
  revision?: unknown
  scene: Scene
  /** Fixed layout width. Omit it to follow the mounted surface. */
  width?: number
}

interface ThreeSurfaceSizeOptions {
  height?: number
  onResize?: (size: ThreeSurfaceSize) => void
  pixelRatio?: number
  width?: number
}

/** Shared SSR fallback and measured-size state for every renderer family. */
export function useThreeSurfaceSize({
  height,
  onResize,
  pixelRatio,
  width,
}: ThreeSurfaceSizeOptions) {
  const [measured, setMeasured] = useState<ThreeSurfaceSize>({
    width: width ?? 300,
    height: height ?? 150,
    pixelRatio: pixelRatio ?? 1,
  })
  const callback = useRef(onResize)
  callback.current = onResize
  const size = useMemo(
    () => ({
      width: width ?? measured.width,
      height: height ?? measured.height,
      pixelRatio: pixelRatio ?? measured.pixelRatio,
    }),
    [height, measured, pixelRatio, width],
  )
  const measure = useCallback((next: ThreeSurfaceSize) => {
    setMeasured((current) =>
      current.width === next.width &&
      current.height === next.height &&
      current.pixelRatio === next.pixelRatio
        ? current
        : next,
    )
  }, [])
  useEffect(() => {
    callback.current?.(size)
  }, [size])
  return { measure, size } as const
}

/** Apply the only camera resize rule whose intent is unambiguous. */
export function resizeThreeCamera(
  camera: Camera,
  size: Pick<ThreeSurfaceSize, 'height' | 'width'>,
  policy: ThreeSurfaceCameraResize = 'auto',
) {
  const perspective = camera as Camera & {
    aspect?: number
    isPerspectiveCamera?: boolean
    updateProjectionMatrix?: () => void
  }
  if (policy === 'manual' || !perspective.isPerspectiveCamera || size.height <= 0) return
  const aspect = size.width / size.height
  if (perspective.aspect === aspect) return
  perspective.aspect = aspect
  perspective.updateProjectionMatrix?.()
}

interface ThreeSurfaceLifecycleOptions<TCamera extends Camera> {
  camera: TCamera
  frameloop: ThreeSurfaceFrameloop
  /** Optional renderer-owned fast path for continuous frames. */
  onAnimationFrame?: () => void
  onFrame?: (frame: ThreeSurfaceFrame<TCamera>) => void
  ref?: Ref<ThreeSurfaceHandle>
  scene: Scene
}

/**
 * Renderer-independent demand invalidation and animation lifecycle.
 *
 * Renderer adapters consume `frameRevision` as an explicit render token. The
 * hook deliberately does not schedule or perform a draw itself.
 */
export function useThreeSurfaceLifecycle<TCamera extends Camera>({
  camera,
  frameloop,
  onAnimationFrame,
  onFrame,
  ref,
  scene,
}: ThreeSurfaceLifecycleOptions<TCamera>) {
  const [frameRevision, invalidateReducer] = useReducer((value: number) => value + 1, 0)
  const invalidate = useCallback(() => invalidateReducer(), [])
  const frameCallback = useRef(onFrame)
  const animationCallback = useRef(onAnimationFrame)
  frameCallback.current = onFrame
  animationCallback.current = onAnimationFrame

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
      if (animationCallback.current) animationCallback.current()
      else invalidate()
      request = requestAnimationFrame(frame)
    }
    request = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(request)
  }, [camera, frameloop, invalidate, scene])

  return { frameRevision, invalidate } as const
}
