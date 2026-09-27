import type { CanvasAccessibilityProps } from '@hozo/canvas'
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type Ref,
  useEffect,
  useRef,
  useState,
} from 'react'
import { type Camera, type Scene, WebGLRenderer, type WebGLRendererParameters } from 'three'

import {
  type ThreeSurfaceFrame,
  type ThreeSurfaceFrameloop,
  type ThreeSurfaceHandle,
  useThreeSurfaceLifecycle,
} from './surface.ts'

export type ThreeCanvasFrameloop = ThreeSurfaceFrameloop
export type ThreeCanvasFrame = ThreeSurfaceFrame<Camera>
export type ThreeCanvasHandle = ThreeSurfaceHandle

export type ThreeWebGLRendererFactory = (
  canvas: HTMLCanvasElement,
  options: Omit<WebGLRendererParameters, 'canvas'>,
) => WebGLRenderer

type CanvasElementProps = Omit<
  ComponentPropsWithoutRef<'canvas'>,
  'aria-label' | 'children' | 'height' | 'ref' | 'role' | 'width'
>

export type ThreeCanvasProps = CanvasAccessibilityProps &
  CanvasElementProps & {
    camera: Camera
    /** Creates the owned renderer. Primarily useful for custom renderer subclasses and tests. */
    createRenderer?: ThreeWebGLRendererFactory
    frameloop?: ThreeCanvasFrameloop
    height: number
    onCreated?: (renderer: WebGLRenderer) => void
    onError?: (error: unknown) => void
    onFrame?: (frame: ThreeCanvasFrame) => void
    /** Defaults to the current device pixel ratio. */
    pixelRatio?: number
    ref?: Ref<ThreeCanvasHandle>
    rendererOptions?: Omit<WebGLRendererParameters, 'canvas'>
    revision?: unknown
    scene: Scene
    width: number
  }

const defaultCreateRenderer: ThreeWebGLRendererFactory = (canvas, options) =>
  new WebGLRenderer({ ...options, canvas })

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

/** A Web-only Three.js surface backed by the classic `WebGLRenderer`. */
export function ThreeCanvas({
  accessibilityLabel,
  accessibleFallback,
  camera,
  createRenderer = defaultCreateRenderer,
  decorative,
  frameloop = 'demand',
  height,
  onCreated,
  onError,
  onFrame,
  pixelRatio,
  ref,
  rendererOptions = {},
  revision,
  scene,
  style,
  width,
  ...canvasProps
}: ThreeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const creationOptions = useRef(rendererOptions)
  const createdCallback = useRef(onCreated)
  const errorCallback = useRef(onError)
  const [renderer, setRenderer] = useState<WebGLRenderer>()
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let nextRenderer: WebGLRenderer
    try {
      nextRenderer = createRenderer(canvas, creationOptions.current)
    } catch (error) {
      errorCallback.current?.(error)
      if (!errorCallback.current) setCreationError(error)
      return
    }
    setRenderer(nextRenderer)
    createdCallback.current?.(nextRenderer)
    return () => {
      setRenderer(undefined)
      nextRenderer.dispose()
    }
  }, [createRenderer])

  useEffect(() => {
    if (!renderer) return
    // Explicit invalidation tokens: their values do not enter the draw.
    void frameRevision
    void revision
    renderer.setPixelRatio(pixelRatio ?? globalThis.devicePixelRatio ?? 1)
    renderer.setSize(width, height, false)
    renderer.render(scene, camera)
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
      />
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
