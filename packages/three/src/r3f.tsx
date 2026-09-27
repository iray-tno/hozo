import type { CanvasAccessibilityProps } from '@hozo/canvas'
import { Canvas as FiberCanvas, type CanvasProps as FiberCanvasProps } from '@react-three/fiber'
import type { CSSProperties, ReactNode } from 'react'

type R3FCanvasProps = Omit<
  FiberCanvasProps,
  'aria-hidden' | 'aria-label' | 'children' | 'className' | 'role' | 'style'
>

export type ThreeCanvasProps = CanvasAccessibilityProps &
  R3FCanvasProps & {
    children?: ReactNode
    className?: string
    style?: CSSProperties
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

/**
 * An accessibility and layout envelope around React Three Fiber's Web Canvas.
 *
 * R3F retains ownership of its reconciler, renderer, events, and scene. Hozo
 * contributes the same mutually exclusive surface semantics as its direct
 * Three.js adapters without reaching into R3F's private instance metadata.
 */
export function ThreeCanvas({
  accessibilityLabel,
  accessibleFallback,
  children,
  className,
  decorative,
  style,
  ...fiberProps
}: ThreeCanvasProps) {
  const hasFallback = accessibleFallback !== undefined
  const labelled = !decorative && !hasFallback
  return (
    <div
      className={className}
      style={{ position: 'relative', width: 300, height: 150, ...style }}
      aria-hidden={decorative ? true : undefined}
      aria-label={labelled ? accessibilityLabel : undefined}
      role={labelled ? 'img' : undefined}
      data-hozo-three-r3f=""
    >
      <FiberCanvas {...fiberProps} aria-hidden style={{ width: '100%', height: '100%' }}>
        {children}
      </FiberCanvas>
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
    </div>
  )
}
