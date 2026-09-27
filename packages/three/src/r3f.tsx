import type { CanvasAccessibilityProps } from '@hozo/canvas'
import { Canvas as FiberCanvas, type CanvasProps as FiberCanvasProps } from '@react-three/fiber'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import type { Object3D } from 'three'

type R3FCanvasProps = Omit<
  FiberCanvasProps,
  'aria-hidden' | 'aria-label' | 'children' | 'className' | 'role' | 'style'
>

export type R3FAccessibleObjectTarget = Object3D | RefObject<Object3D | null>

interface R3FAccessibleObjectBase {
  /** Stable identity and semantic-control order are owned by the application. */
  id: string
  label: string
  object: R3FAccessibleObjectTarget
  disabled?: boolean
}

export interface R3FAccessibleObjectEvent {
  id: string
  object: Object3D
}

export type R3FAccessibleObject =
  | (R3FAccessibleObjectBase & {
      href?: never
      external?: never
      replace?: never
      onPress: (event: R3FAccessibleObjectEvent) => void
    })
  | (R3FAccessibleObjectBase & {
      href: string
      external?: boolean
      replace?: boolean
      onPress?: never
    })

export type ThreeCanvasProps = CanvasAccessibilityProps &
  R3FCanvasProps & {
    /** Explicit public bridge from R3F objects to keyboard and screen-reader controls. */
    accessibleObjects?: readonly R3FAccessibleObject[]
    children?: ReactNode
    className?: string
    /** Reports semantic-control focus without competing with R3F pointer events. */
    onObjectActiveChange?: (event: R3FAccessibleObjectEvent | undefined) => void
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
  accessibleObjects = [],
  children,
  className,
  decorative,
  onObjectActiveChange,
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
      data-hozo-three-r3f=""
    >
      <div
        aria-hidden={labelled ? undefined : true}
        aria-label={labelled ? accessibilityLabel : undefined}
        role={labelled ? 'img' : undefined}
        style={{ width: '100%', height: '100%' }}
        data-hozo-three-surface=""
      >
        <FiberCanvas {...fiberProps} aria-hidden style={{ width: '100%', height: '100%' }}>
          {children}
        </FiberCanvas>
      </div>
      {accessibleObjects.some(({ disabled }) => !disabled) ? (
        <div style={accessibleOnlyStyle} data-hozo-three-controls="">
          {accessibleObjects.map((control) => {
            if (control.disabled) return null
            const focus = () => {
              const object = resolveAccessibleObject(control.object)
              if (object) onObjectActiveChange?.({ id: control.id, object })
            }
            if (control.href !== undefined) {
              return (
                <a
                  key={control.id}
                  href={control.href}
                  target={control.external ? '_blank' : undefined}
                  rel={control.external ? 'noreferrer noopener' : undefined}
                  data-hozo-navigation-replace={control.replace ? '' : undefined}
                  onFocus={focus}
                  onBlur={() => onObjectActiveChange?.(undefined)}
                >
                  {control.label}
                </a>
              )
            }
            return (
              <button
                key={control.id}
                type="button"
                onClick={() => {
                  const object = resolveAccessibleObject(control.object)
                  if (object) control.onPress({ id: control.id, object })
                }}
                onFocus={focus}
                onBlur={() => onObjectActiveChange?.(undefined)}
              >
                {control.label}
              </button>
            )
          })}
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
    </div>
  )
}

function resolveAccessibleObject(target: R3FAccessibleObjectTarget) {
  return 'current' in target ? target.current : target
}
