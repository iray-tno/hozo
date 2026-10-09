import { createElement } from 'react'
import { type IconBaseProps, type IconNode, iconShapes } from './icon-node.ts'

export type { IconNode }
export type IconProps = IconBaseProps

/**
 * An icon (#145): an inline `<svg>` drawn from `IconNode` data, stroked in
 * `currentColor` so it takes the colour of the text around it.
 *
 * Decoration unless named: `aria-hidden` with no name, `role="img"` with an
 * `aria-label` and a `<title>` with one. Not focusable either way -- an icon
 * is never the control; the button around it is.
 */
export function Icon({
  icon,
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  accessibilityLabel,
  className,
  testID,
}: IconProps) {
  const named = accessibilityLabel !== undefined && accessibilityLabel !== ''
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={named ? 'img' : undefined}
      aria-label={named ? accessibilityLabel : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
      className={className}
      data-testid={testID}
    >
      {named ? <title>{accessibilityLabel}</title> : null}
      {iconShapes(icon).map(({ tag, key, props }) => createElement(tag, { key, ...props }))}
    </svg>
  )
}
