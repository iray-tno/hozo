import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { type CanvasAccessibilityProps, canvasAccessibilityMode } from './accessibility.ts'
import { type CanvasPoint, hitTestCanvas } from './hit-test.ts'
import { renderCanvas2D } from './render-canvas-2d.ts'
import {
  Circle,
  Clip,
  Ellipse,
  Group,
  Line,
  Path,
  Rect,
  RoundedRect,
  useCanvasScene,
} from './scene.tsx'

export type { CanvasAccessibilityProps, CanvasAccessibleFallback } from './accessibility.ts'
export {
  type CanvasHitTestResult,
  type CanvasHitTestViewport,
  type CanvasPoint,
  hitTestCanvas,
} from './hit-test.ts'
export { type CanvasViewport, renderCanvas2D } from './render-canvas-2d.ts'
export type {
  CanvasInteractionProps,
  CanvasPaintProps,
  CanvasPressEvent,
  CanvasScene,
  CanvasSceneNode,
  CanvasTransform,
  CircleProps,
  ClipProps,
  EllipseProps,
  GroupProps,
  LineProps,
  PathProps,
  RectProps,
  RoundedRectProps,
} from './scene.tsx'
export { CanvasSceneStore } from './scene.tsx'

export type CanvasProps = CanvasAccessibilityProps & {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  width?: number
  height?: number
  viewBox?: readonly [x: number, y: number, width: number, height: number]
  fit?: 'contain' | 'stretch'
  testID?: string
}

interface Size {
  width: number
  height: number
  pixelRatio: number
}

const useIsoLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

function Root({
  children,
  className,
  style,
  width,
  height,
  viewBox,
  fit = 'contain',
  decorative,
  accessibilityLabel,
  accessibleFallback,
  testID,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pressedTargets = useRef(new Map<number, string>())
  const { scene, collector, isInteractive, press, activate } = useCanvasScene(children)
  const [size, setSize] = useState<Size>(() => ({
    width: width ?? viewBox?.[2] ?? 300,
    height: height ?? viewBox?.[3] ?? 150,
    pixelRatio: 1,
  }))

  useIsoLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const measure = () => {
      const bounds = canvas.getBoundingClientRect()
      const next = {
        width: width ?? (bounds.width || viewBox?.[2] || 300),
        height: height ?? (bounds.height || viewBox?.[3] || 150),
        pixelRatio: globalThis.devicePixelRatio || 1,
      }
      setSize((current) =>
        current.width === next.width &&
        current.height === next.height &&
        current.pixelRatio === next.pixelRatio
          ? current
          : next,
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [width, height, viewBox])

  useIsoLayoutEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    renderCanvas2D(context, scene, { ...size, viewBox, fit })
  }, [scene, size, viewBox, fit])

  const rootStyle: CSSProperties = {
    ...style,
    ...(width === undefined ? null : { width }),
    ...(height === undefined ? null : { height }),
  }
  const accessibilityMode = canvasAccessibilityMode({ decorative, accessibleFallback })
  const surfacePoint = (event: ReactPointerEvent<HTMLCanvasElement>): CanvasPoint => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) * size.width) / (bounds.width || size.width || 1),
      y: ((event.clientY - bounds.top) * size.height) / (bounds.height || size.height || 1),
    }
  }
  const hitAt = (point: CanvasPoint) =>
    hitTestCanvas(
      scene,
      point,
      { width: size.width, height: size.height, viewBox, fit },
      isInteractive,
    )
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pressedTargets.current.delete(event.pointerId)
    if (!event.isPrimary || event.button !== 0) return
    const hit = hitAt(surfacePoint(event))
    if (!hit) return
    pressedTargets.current.set(event.pointerId, hit.id)
    if (event.pointerType === 'touch') {
      activate(hit.id, { point: hit.point, surfacePoint: surfacePoint(event) })
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const startedTarget = pressedTargets.current.get(event.pointerId)
    pressedTargets.current.delete(event.pointerId)
    if (!startedTarget) return
    const point = surfacePoint(event)
    const hit = hitAt(point)
    // The finger has gone, so it indicates nothing -- whether or not the
    // release also counted as a press.
    if (event.pointerType === 'touch') activate(undefined, undefined)
    if (!hit || hit.id !== startedTarget) return
    press(hit.id, { point: hit.point, surfacePoint: point })
  }
  const onPointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pressedTargets.current.delete(event.pointerId)
    activate(undefined, undefined)
  }
  /**
   * What a mouse or a pen indicates by being over it.
   *
   * `pointerType` decides whether this counts, and it has to: a finger
   * emits `pointermove` too, but only while it is touching, so treating
   * that as hover would make a tap indicate the shape it landed on and
   * keep indicating it after the finger left. Touch indicates by holding
   * instead, which is what the press handlers below do.
   */
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch') return
    const point = surfacePoint(event)
    const hit = hitAt(point)
    activate(hit?.id, hit ? { point: hit.point, surfacePoint: point } : undefined)
  }
  const onPointerLeave = () => activate(undefined, undefined)

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        style={rootStyle}
        width={Math.max(1, Math.round(size.width * size.pixelRatio))}
        height={Math.max(1, Math.round(size.height * size.pixelRatio))}
        aria-hidden={accessibilityMode === 'label' ? undefined : true}
        aria-label={accessibilityMode === 'label' ? accessibilityLabel : undefined}
        role={accessibilityMode === 'label' ? 'img' : undefined}
        data-testid={testID}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onLostPointerCapture={onPointerCancel}
      >
        {collector}
      </canvas>
      {accessibilityMode === 'fallback' ? (
        <div
          style={accessibleOnlyStyle}
          role={accessibilityLabel ? 'group' : undefined}
          aria-label={accessibilityLabel}
          data-hozo-canvas-fallback=""
        >
          {accessibleFallback}
        </div>
      ) : null}
    </>
  )
}

const accessibleOnlyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

/** Canvas root plus its platform-neutral scene vocabulary. */
export const Canvas = Object.assign(Root, {
  Group,
  Clip,
  Rect,
  RoundedRect,
  Circle,
  Ellipse,
  Line,
  Path,
})
