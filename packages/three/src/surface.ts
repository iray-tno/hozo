import { type Ref, useCallback, useEffect, useImperativeHandle, useReducer, useRef } from 'react'
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

export interface ThreeSurfaceProps<TCamera extends Camera = Camera> {
  camera: TCamera
  frameloop?: ThreeSurfaceFrameloop
  height: number
  onFrame?: (frame: ThreeSurfaceFrame<TCamera>) => void
  ref?: Ref<ThreeSurfaceHandle>
  /**
   * An application-owned value that invalidates demand rendering when it
   * changes. Useful when an imperative ref is inconvenient.
   */
  revision?: unknown
  scene: Scene
  width: number
}

interface ThreeSurfaceLifecycleOptions<TCamera extends Camera> {
  camera: TCamera
  frameloop: ThreeSurfaceFrameloop
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
  onFrame,
  ref,
  scene,
}: ThreeSurfaceLifecycleOptions<TCamera>) {
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

  return { frameRevision, invalidate } as const
}
