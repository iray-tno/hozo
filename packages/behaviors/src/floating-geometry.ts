export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export type BasePlacement = 'top' | 'bottom' | 'left' | 'right'
export type Alignment = 'start' | 'center' | 'end'
export type Placement = BasePlacement | `${BasePlacement}-start` | `${BasePlacement}-end`

export interface ComputePositionOptions {
  /** Desired placement relative to the anchor. Default: 'bottom' */
  placement?: Placement
  /** Distance along the main axis between anchor and floating element in pixels. Default: 8 */
  offset?: number
  /** Offset along the cross axis in pixels. Default: 0 */
  crossAxisOffset?: number
  /** Whether to flip placement if floating element overflows viewport. Default: true */
  flip?: boolean
  /** Whether to shift floating element to keep it within viewport. Default: true */
  shift?: boolean
  /** Minimum padding from the viewport edge in pixels. Default: 8 */
  viewportPadding?: number
  /** Minimum padding from the floating edge to arrow center in pixels. Default: 4 */
  arrowPadding?: number
}

export interface PositionResult {
  x: number
  y: number
  placement: Placement
  basePlacement: BasePlacement
  alignment: Alignment
  flipped: boolean
  shifted: boolean
  arrow?: {
    x?: number
    y?: number
  }
}

export function parsePlacement(placement: Placement): {
  basePlacement: BasePlacement
  alignment: Alignment
} {
  const [base, align] = placement.split('-') as [BasePlacement, Alignment | undefined]
  return {
    basePlacement: base,
    alignment: align ?? 'center',
  }
}

function getOppositeBase(base: BasePlacement): BasePlacement {
  switch (base) {
    case 'top':
      return 'bottom'
    case 'bottom':
      return 'top'
    case 'left':
      return 'right'
    case 'right':
      return 'left'
  }
}

function calculateRawCoords(
  anchor: Rect,
  floating: Rect,
  base: BasePlacement,
  align: Alignment,
  offset: number,
  crossAxisOffset: number,
): { x: number; y: number } {
  let x = 0
  let y = 0

  if (base === 'top') {
    y = anchor.y - floating.height - offset
  } else if (base === 'bottom') {
    y = anchor.y + anchor.height + offset
  } else if (base === 'left') {
    x = anchor.x - floating.width - offset
  } else if (base === 'right') {
    x = anchor.x + anchor.width + offset
  }

  if (base === 'top' || base === 'bottom') {
    if (align === 'start') {
      x = anchor.x + crossAxisOffset
    } else if (align === 'end') {
      x = anchor.x + anchor.width - floating.width + crossAxisOffset
    } else {
      x = anchor.x + (anchor.width - floating.width) / 2 + crossAxisOffset
    }
  } else {
    if (align === 'start') {
      y = anchor.y + crossAxisOffset
    } else if (align === 'end') {
      y = anchor.y + anchor.height - floating.height + crossAxisOffset
    } else {
      y = anchor.y + (anchor.height - floating.height) / 2 + crossAxisOffset
    }
  }

  return { x, y }
}

/**
 * Pure geometric calculation for positioning floating elements relative to an anchor.
 * Supports Popper/Floating-UI equivalent placement, flip, shift, and arrow calculation.
 */
export function computePosition(
  anchor: Rect,
  floating: Rect,
  viewport: Viewport,
  options: ComputePositionOptions = {},
): PositionResult {
  const {
    placement = 'bottom',
    offset = 8,
    crossAxisOffset = 0,
    flip = true,
    shift = true,
    viewportPadding = 8,
    arrowPadding = 4,
  } = options

  const parsed = parsePlacement(placement)
  let currentBase = parsed.basePlacement
  const currentAlign = parsed.alignment
  let flipped = false

  let coords = calculateRawCoords(
    anchor,
    floating,
    currentBase,
    currentAlign,
    offset,
    crossAxisOffset,
  )

  // Check collision for flipping
  if (flip) {
    let overflows = false
    if (currentBase === 'top') {
      overflows = coords.y < viewportPadding
    } else if (currentBase === 'bottom') {
      overflows = coords.y + floating.height > viewport.height - viewportPadding
    } else if (currentBase === 'left') {
      overflows = coords.x < viewportPadding
    } else if (currentBase === 'right') {
      overflows = coords.x + floating.width > viewport.width - viewportPadding
    }

    if (overflows) {
      const oppositeBase = getOppositeBase(currentBase)
      const oppositeCoords = calculateRawCoords(
        anchor,
        floating,
        oppositeBase,
        currentAlign,
        offset,
        crossAxisOffset,
      )

      // Measure spaces
      let currentSpace = 0
      let oppositeSpace = 0

      if (currentBase === 'top') {
        currentSpace = anchor.y
        oppositeSpace = viewport.height - (anchor.y + anchor.height)
      } else if (currentBase === 'bottom') {
        currentSpace = viewport.height - (anchor.y + anchor.height)
        oppositeSpace = anchor.y
      } else if (currentBase === 'left') {
        currentSpace = anchor.x
        oppositeSpace = viewport.width - (anchor.x + anchor.width)
      } else if (currentBase === 'right') {
        currentSpace = viewport.width - (anchor.x + anchor.width)
        oppositeSpace = anchor.x
      }

      // Flip if opposite side has more space or fits
      if (oppositeSpace > currentSpace) {
        currentBase = oppositeBase
        coords = oppositeCoords
        flipped = true
      }
    }
  }

  let finalX = coords.x
  let finalY = coords.y
  let shifted = false

  // Shift along cross-axis to stay within viewport
  if (shift) {
    const minX = viewportPadding
    const maxX = Math.max(viewportPadding, viewport.width - floating.width - viewportPadding)
    const minY = viewportPadding
    const maxY = Math.max(viewportPadding, viewport.height - floating.height - viewportPadding)

    const clampedX = Math.min(Math.max(finalX, minX), maxX)
    const clampedY = Math.min(Math.max(finalY, minY), maxY)

    if (clampedX !== finalX || clampedY !== finalY) {
      shifted = true
      finalX = clampedX
      finalY = clampedY
    }
  }

  // Calculate arrow position (relative to floating element top-left)
  let arrow: { x?: number; y?: number } | undefined
  if (currentBase === 'top' || currentBase === 'bottom') {
    const anchorCenter = anchor.x + anchor.width / 2
    const rawArrowX = anchorCenter - finalX
    const minArrowX = arrowPadding
    const maxArrowX = Math.max(arrowPadding, floating.width - arrowPadding)
    arrow = {
      x: Math.min(Math.max(rawArrowX, minArrowX), maxArrowX),
    }
  } else {
    const anchorCenter = anchor.y + anchor.height / 2
    const rawArrowY = anchorCenter - finalY
    const minArrowY = arrowPadding
    const maxArrowY = Math.max(arrowPadding, floating.height - arrowPadding)
    arrow = {
      y: Math.min(Math.max(rawArrowY, minArrowY), maxArrowY),
    }
  }

  const finalPlacement =
    currentAlign === 'center' ? currentBase : (`${currentBase}-${currentAlign}` as Placement)

  return {
    x: Math.round(finalX),
    y: Math.round(finalY),
    placement: finalPlacement,
    basePlacement: currentBase,
    alignment: currentAlign,
    flipped,
    shifted,
    arrow,
  }
}
