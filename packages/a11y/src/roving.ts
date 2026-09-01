// Which item takes focus next, in a widget where the group is one tab stop.
//
// The same split as `./focus.ts`: no `react`, no `document`, so the rules
// can be tested as rules. What is left to the platform there is left to it
// here too -- this decides an index and nothing else calls `.focus()`.
//
// Roving tabindex is the mechanism under a surprising number of the WAI-
// ARIA patterns: tabs, menus, toolbars, radio groups, listboxes, trees,
// grids. The group holds one tab stop and the arrow keys move within it,
// which is what makes a twenty-item toolbar one Tab away from the next
// control instead of twenty. Every one of those patterns disagrees about
// *which* arrows and whether the ends wrap, and agrees about everything
// else -- so the differences are parameters and the rest is this file.

/** Which arrows move within the group. */
export type Orientation = 'horizontal' | 'vertical' | 'both'

/** The keys this understands, spelled as `KeyboardEvent.key`. */
export type RovingKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

export interface RovingOptions {
  /** How many items the group has. */
  count: number
  /** Which one has focus now. */
  active: number
  orientation?: Orientation
  /**
   * Whether the ends join up.
   *
   * On by default because the patterns that use this mostly wrap, and
   * because the alternative is a dead key press: at the last tab, Right
   * doing nothing is indistinguishable from the widget being broken.
   */
  wrap?: boolean
  /**
   * Items that cannot take focus, by index.
   *
   * Skipped rather than landed on. A disabled item in a menu is still in
   * the menu -- it is announced, it holds its place -- and arrowing onto
   * it would strand the user on something that cannot act.
   */
  disabled?: readonly number[]
  /**
   * Whether the writing direction is right-to-left.
   *
   * Left and Right are about the screen, not the sequence. In Arabic or
   * Hebrew the first tab is on the right, so Right has to mean *previous*
   * -- and this is the kind of thing that is invisible to everyone who
   * builds it and wrong for everyone who reads that way.
   */
  rtl?: boolean
}

/**
 * The index `key` moves focus to, or `null` when the key does not belong
 * to this widget.
 *
 * `null` is load-bearing and not an error: it is how the caller knows to
 * leave the event alone. A tab strip that swallows ArrowUp has taken a key
 * away from the page's own scrolling for no reason, and a `preventDefault`
 * on every key is how a widget stops being a widget and becomes a trap.
 */
export function nextIndex(key: RovingKey, options: RovingOptions): number | null {
  const {
    count,
    active,
    orientation = 'horizontal',
    wrap = true,
    disabled = [],
    rtl = false,
  } = options
  if (count <= 0) return null

  const horizontal = orientation === 'horizontal' || orientation === 'both'
  const vertical = orientation === 'vertical' || orientation === 'both'

  // Home and End are absolute, so they ignore orientation and direction
  // entirely -- and they mean the first and last *reachable* item, which
  // is not the same as index 0 when index 0 is disabled.
  if (key === 'Home') return seek(0, 1, count, disabled, false, active)
  if (key === 'End') return seek(count - 1, -1, count, disabled, false, active)

  const step = arrowStep(key, horizontal, vertical, rtl)
  if (step === null) return null
  return seek(active + step, step, count, disabled, wrap, active)
}

/** Which way an arrow moves, or `null` if this widget does not take it. */
function arrowStep(
  key: RovingKey,
  horizontal: boolean,
  vertical: boolean,
  rtl: boolean,
): number | null {
  switch (key) {
    case 'ArrowLeft':
      return horizontal ? (rtl ? 1 : -1) : null
    case 'ArrowRight':
      return horizontal ? (rtl ? -1 : 1) : null
    case 'ArrowUp':
      return vertical ? -1 : null
    case 'ArrowDown':
      return vertical ? 1 : null
    default:
      return null
  }
}

/**
 * The first index from `from` going in `step` that can take focus.
 *
 * Returns `active` unchanged rather than `null` when there is nowhere to
 * go: the key *was* ours, and reporting it as unhandled would hand it to
 * the page after the widget had already decided it belonged here.
 */
function seek(
  from: number,
  step: number,
  count: number,
  disabled: readonly number[],
  wrap: boolean,
  active: number,
): number {
  let index = from
  // At most one pass. Every item disabled is a real state -- a toolbar
  // whose actions are all unavailable -- and without the bound it spins.
  for (let moved = 0; moved <= count; moved += 1) {
    if (index < 0 || index >= count) {
      if (!wrap) return active
      index = index < 0 ? count - 1 : 0
    }
    if (!disabled.includes(index)) return index
    index += step
  }
  return active
}

/**
 * The `tabIndex` for each item: one tab stop for the group.
 *
 * The whole point of the pattern, and the half that is easy to leave out.
 * Without it every item is a tab stop and the arrow keys are decoration on
 * top of a tab order twenty presses long.
 *
 * When the active item is disabled -- which happens the moment a selected
 * tab becomes unavailable -- the tab stop moves to the first item that can
 * take it, because a group whose only tab stop cannot be focused is a
 * group keyboard users cannot enter at all.
 */
export function tabStops(options: Pick<RovingOptions, 'count' | 'active' | 'disabled'>): number[] {
  const { count, active, disabled = [] } = options
  const stop = disabled.includes(active) ? seek(0, 1, count, disabled, false, active) : active
  return Array.from({ length: count }, (_, index) => (index === stop ? 0 : -1))
}
