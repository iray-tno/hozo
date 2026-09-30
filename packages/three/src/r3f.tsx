import type { CanvasAccessibilityProps } from '@hozo/canvas'
import { Canvas as FiberCanvas, type CanvasProps as FiberCanvasProps } from '@react-three/fiber'
import { type CSSProperties, type ReactNode, useState } from 'react'

import { accessibleOnlyStyle, focusLeft, revealedControlsStyle } from './accessible-controls.ts'
import {
  type R3FAccessibleObject,
  type R3FAccessibleObjectEvent,
  resolveR3FAccessibleObject,
} from './r3f-accessibility.ts'

export type {
  R3FAccessibleObject,
  R3FAccessibleObjectEvent,
  R3FAccessibleObjectTarget,
} from './r3f-accessibility.ts'

type R3FCanvasProps = Omit<
  FiberCanvasProps,
  'aria-hidden' | 'aria-label' | 'children' | 'className' | 'role' | 'style'
>

type FunctionMember<T> = T extends (...args: never[]) => unknown ? T : never

/** The sync or async renderer factory accepted by R3F's public `gl` prop. */
export type R3FRendererFactory = FunctionMember<NonNullable<FiberCanvasProps['gl']>>
export type R3FRendererFactoryProps = Parameters<R3FRendererFactory>[0]

export type ThreeCanvasProps = CanvasAccessibilityProps &
  R3FCanvasProps & {
    /** Explicit public bridge from R3F objects to keyboard and screen-reader controls. */
    accessibleObjects?: readonly R3FAccessibleObject[]
    children?: ReactNode
    className?: string
    /**
     * On each accessible control, which is the element a keyboard reaches.
     *
     * The strip they live in is clipped at rest and revealed while focus is
     * inside it, with the user agent's own colours -- so a control is visible
     * and readable without this. It is here because the package's colours are
     * the two a user agent guarantees and nothing more, and a scene is somebody
     * else's design. #689 asked for it after `check-appearance.mjs` found the
     * control with nothing an application could reach.
     */
    controlClassName?: string
    /** Reports semantic-control focus without competing with R3F pointer events. */
    onObjectActiveChange?: (event: R3FAccessibleObjectEvent | undefined) => void
    style?: CSSProperties
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
  controlClassName,
  decorative,
  onObjectActiveChange,
  style,
  ...fiberProps
}: ThreeCanvasProps) {
  const hasFallback = accessibleFallback !== undefined
  const labelled = !decorative && !hasFallback
  // Whether the control strip is showing. State rather than `:focus-within`,
  // because this package ships no stylesheet to put a pseudo-class in -- the
  // clip it is replacing is an inline style for the same reason.
  const [reached, setReached] = useState(false)
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
        // biome-ignore lint/a11y/noStaticElementInteractions: focus events on a container are how :focus-within is answered without a stylesheet, and the controls inside are real buttons
        <div
          style={reached ? revealedControlsStyle : accessibleOnlyStyle}
          data-hozo-three-controls=""
          data-hozo-three-reached={reached ? '' : undefined}
          onFocus={() => setReached(true)}
          onBlur={(event) => {
            if (focusLeft(event)) setReached(false)
          }}
        >
          {accessibleObjects.map((control) => {
            if (control.disabled) return null
            const focus = () => {
              const object = resolveR3FAccessibleObject(control.object)
              if (object) onObjectActiveChange?.({ id: control.id, object })
            }
            if (control.href !== undefined) {
              return (
                <a
                  key={control.id}
                  className={controlClassName}
                  data-testid={control.testID}
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
                className={controlClassName}
                data-testid={control.testID}
                type="button"
                onClick={() => {
                  const object = resolveR3FAccessibleObject(control.object)
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
