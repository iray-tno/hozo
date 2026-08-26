import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

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

export type {
  CanvasPaintProps,
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
export { renderCanvas2D, type CanvasViewport } from './render-canvas-2d.ts'

type AccessibleCanvas =
  | { decorative: true; accessibilityLabel?: never; accessibleFallback?: never }
  | { decorative?: false; accessibilityLabel: string; accessibleFallback?: ReactNode }
  | { decorative?: false; accessibilityLabel?: string; accessibleFallback: ReactNode }

export type CanvasProps = AccessibleCanvas & {
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
  const { scene, collector } = useCanvasScene(children)
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
      setSize((current) => current.width === next.width
        && current.height === next.height
        && current.pixelRatio === next.pixelRatio
        ? current
        : next)
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

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={rootStyle}
      width={Math.max(1, Math.round(size.width * size.pixelRatio))}
      height={Math.max(1, Math.round(size.height * size.pixelRatio))}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : accessibilityLabel}
      role={decorative ? undefined : 'img'}
      data-testid={testID}
    >
      {collector}
      {accessibleFallback}
    </canvas>
  )
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
