import type { BasePlacement, Rect } from './floating-geometry.ts'

export interface Point {
  x: number
  y: number
}

export type Polygon = Point[]

/**
 * Determines whether a point lies within a polygon using the Ray-Casting algorithm.
 * Used for Safe Polygon calculation between trigger and floating content.
 */
export function isPointInPolygon(point: Point, polygon: Polygon): boolean {
  if (polygon.length < 3) return false
  const { x, y } = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p1 = polygon[i]
    const p2 = polygon[j]
    if (!p1 || !p2) continue

    const xi = p1.x
    const yi = p1.y
    const xj = p2.x
    const yj = p2.y

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }

  return inside
}

/**
 * Computes a safe polygon connecting the anchor to the floating element.
 * Moving the pointer within this polygon will prevent the floating content from closing prematurely.
 */
export function computeSafePolygon(
  anchorRect: Rect,
  floatingRect: Rect,
  placement: BasePlacement,
  buffer = 4,
): Polygon {
  switch (placement) {
    case 'bottom': {
      // Anchor is above floating element
      return [
        { x: anchorRect.x - buffer, y: anchorRect.y + anchorRect.height },
        { x: anchorRect.x + anchorRect.width + buffer, y: anchorRect.y + anchorRect.height },
        {
          x: floatingRect.x + floatingRect.width + buffer,
          y: floatingRect.y + floatingRect.height + buffer,
        },
        { x: floatingRect.x - buffer, y: floatingRect.y + floatingRect.height + buffer },
      ]
    }
    case 'top': {
      // Anchor is below floating element
      return [
        { x: anchorRect.x + anchorRect.width + buffer, y: anchorRect.y },
        { x: anchorRect.x - buffer, y: anchorRect.y },
        { x: floatingRect.x - buffer, y: floatingRect.y - buffer },
        { x: floatingRect.x + floatingRect.width + buffer, y: floatingRect.y - buffer },
      ]
    }
    case 'right': {
      // Anchor is to the left of floating element
      return [
        { x: anchorRect.x + anchorRect.width, y: anchorRect.y - buffer },
        { x: anchorRect.x + anchorRect.width, y: anchorRect.y + anchorRect.height + buffer },
        {
          x: floatingRect.x + floatingRect.width + buffer,
          y: floatingRect.y + floatingRect.height + buffer,
        },
        { x: floatingRect.x + floatingRect.width + buffer, y: floatingRect.y - buffer },
      ]
    }
    case 'left': {
      // Anchor is to the right of floating element
      return [
        { x: anchorRect.x, y: anchorRect.y + anchorRect.height + buffer },
        { x: anchorRect.x, y: anchorRect.y - buffer },
        { x: floatingRect.x - buffer, y: floatingRect.y - buffer },
        { x: floatingRect.x - buffer, y: floatingRect.y + floatingRect.height + buffer },
      ]
    }
  }
}

/**
 * State machine for Tooltip Delay Grouping (Warmup / Grace period).
 * When one tooltip opens, subsequent tooltips within the group open instantly (delay = 0ms).
 */
export interface DelayGroupConfig {
  /** Delay in milliseconds before opening an un-warmed tooltip. Default: 700ms. */
  openDelay?: number
  /** Delay in milliseconds before closing when pointer leaves. Default: 300ms. */
  closeDelay?: number
  /** Grace duration in ms after a tooltip closes where the group remains 'warm'. Default: 300ms. */
  skipDelayDuration?: number
}

export class DelayGroupMachine {
  private openDelay: number
  private closeDelay: number
  private skipDelayDuration: number
  private activeId: string | null = null
  private isWarm = false
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: DelayGroupConfig = {}) {
    this.openDelay = config.openDelay ?? 700
    this.closeDelay = config.closeDelay ?? 300
    this.skipDelayDuration = config.skipDelayDuration ?? 300
  }

  /**
   * Returns whether the group is currently warm (i.e. delays should be skipped).
   */
  getIsWarm(): boolean {
    return this.isWarm
  }

  /**
   * Gets the effective open delay for a tooltip.
   * Returns 0 if warm, or standard openDelay otherwise.
   */
  getEffectiveOpenDelay(): number {
    return this.isWarm ? 0 : this.openDelay
  }

  /**
   * Gets the close delay.
   */
  getCloseDelay(): number {
    return this.closeDelay
  }

  /**
   * Called when a tooltip in the group opens.
   */
  onOpen(id: string) {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer)
      this.cooldownTimer = null
    }
    this.activeId = id
    this.isWarm = true
  }

  /**
   * Called when a tooltip in the group closes.
   * Keeps warm state for `skipDelayDuration` before going cold.
   */
  onClose(id: string, onCooldownExpired?: () => void) {
    if (this.activeId === id) {
      this.activeId = null
    }
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer)
    }
    this.cooldownTimer = setTimeout(() => {
      this.isWarm = false
      this.cooldownTimer = null
      onCooldownExpired?.()
    }, this.skipDelayDuration)
  }

  /**
   * Disposes of any pending cooldown timer.
   */
  dispose() {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer)
      this.cooldownTimer = null
    }
    this.isWarm = false
    this.activeId = null
  }
}
