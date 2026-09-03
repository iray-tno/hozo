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
import { type CanvasPoint, canvasNodePoint, hitTestCanvas } from './hit-test.ts'
import { renderCanvas2D } from './render-canvas-2d.ts'
import {
  Circle,
  Clip,
  canvasControls,
  Ellipse,
  Group,
  Line,
  Path,
  Rect,
  RoundedRect,
  Text,
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
  const { scene, collector, isInteractive, press, activate, interactions } =
    useCanvasScene(children)
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
  /**
   * Containment answered by the same engine that draws the path.
   *
   * `Path2D` objects are cached by their string: constructing one parses
   * the path, and a pointer moving across a chart would otherwise reparse
   * every path on every frame.
   *
   * The context is the offscreen one this surface already draws with, and
   * `isPointInPath` reads no state from it beyond the path and the point.
   */
  const paths = useRef(new Map<string, Path2D>())
  const pathHitTest = (path: string, fillRule: 'nonzero' | 'evenodd', point: CanvasPoint) => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return false
    let path2d = paths.current.get(path)
    if (!path2d) {
      path2d = new Path2D(path)
      paths.current.set(path, path2d)
    }
    // Reset first. `isPointInPath` reads the point in the context's
    // *current* transform, and the point handed here is already in the
    // path's own coordinates -- the hit test inverted the viewport and
    // every ancestor to get it there. Relying on the render pass having
    // left an identity transform behind would work today and break the
    // first time something drew after it.
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    const inside = context.isPointInPath(path2d, point.x, point.y, fillRule)
    context.restore()
    return inside
  }

  const hitAt = (point: CanvasPoint) =>
    hitTestCanvas(
      scene,
      point,
      { width: size.width, height: size.height, viewBox, fit },
      isInteractive,
      pathHitTest,
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

  // Warned always rather than in development only: this package has no
  // build-time channel to say it in, and a control nobody can reach is
  // not a development-only problem. `canvasControls` says it once per
  // shape.
  const controls = canvasControls(scene, interactions, (message) =>
    console.warn(`[hozo] ${message}`),
  )
  /**
   * Where a keyboard "is" when it reaches a shape.
   *
   * Its centre in scene coordinates, and the same in surface coordinates
   * only because there is nothing better: a keyboard has no cursor, and a
   * tooltip still has to be told somewhere to appear. A chart that wants
   * to place it from the datum rather than from the point already knows
   * which shape it is.
   */
  const pointFor = (id: string) =>
    canvasNodePoint(scene, id, { width: size.width, height: size.height, viewBox, fit }) ?? {
      point: { x: 0, y: 0 },
      surfacePoint: { x: 0, y: 0 },
    }

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
      {/*
        A real control per named pressable shape.

        The canvas is one element and the shapes in it are pixels, so a
        keyboard has nothing to reach and a screen reader has nothing to
        announce. These are buttons -- real focus, real Enter and Space,
        real accessible names -- placed in the same visually-hidden layer
        the fallback already uses, in scene order so the tab order is the
        reading order.

        Focus moves the active target, which is what makes a tooltip
        appear for a keyboard the same way hovering does for a mouse. The
        surface point is the shape's own: a keyboard has no cursor, so
        there is no other honest answer.

        Rendered whenever there is a named control, not only in
        `fallback` mode. A pressable shape is a control however the
        surface chooses to describe itself.
      */}
      {controls.length > 0 ? (
        <div style={accessibleOnlyStyle} data-hozo-canvas-controls="">
          {controls.map((control) => (
            <button
              key={control.id}
              type="button"
              onClick={() => press(control.id, pointFor(control.id))}
              onFocus={() => activate(control.id, pointFor(control.id))}
              onBlur={() => activate(undefined, undefined)}
            >
              {control.label}
            </button>
          ))}
        </div>
      ) : null}
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
  Text,
  Rect,
  RoundedRect,
  Circle,
  Ellipse,
  Line,

  Path,
})
