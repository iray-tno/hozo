import type { ReactNode } from 'react'

/** A fallback must render something; nullish and boolean React nodes do not. */
export type CanvasAccessibleFallback = Exclude<ReactNode, boolean | null | undefined>

export type CanvasAccessibilityProps =
  | { decorative: true; accessibilityLabel?: never; accessibleFallback?: never }
  | { decorative?: false; accessibilityLabel: string; accessibleFallback?: CanvasAccessibleFallback }
  | { decorative?: false; accessibilityLabel?: string; accessibleFallback: CanvasAccessibleFallback }

export type CanvasAccessibilityMode = 'decorative' | 'label' | 'fallback'

/** Shared policy; each platform decides how that mode maps to its accessibility tree. */
export function canvasAccessibilityMode(
  props: Pick<CanvasAccessibilityProps, 'decorative' | 'accessibilityLabel' | 'accessibleFallback'>,
): CanvasAccessibilityMode {
  if (props.decorative) return 'decorative'
  if (props.accessibleFallback !== undefined) return 'fallback'
  return 'label'
}
