/**
 * The arithmetic a draggable overlay is, with no element in it.
 *
 * Split out for the reason `slider-rules.ts` is: the hard part of a bottom
 * sheet is not the markup. Where a flick lands, which detent wins a release,
 * and when a drag becomes a dismissal are pure functions, and a test that has
 * to render something and synthesise pointer events to ask "does 0.9 px/ms
 * downward from half-open dismiss it" is a test nobody writes. Both platform
 * halves import this, so the Web sheet and the Native sheet cannot disagree
 * about where a gesture ends -- and `Drawer` imports it too, which is the claim
 * the second paragraph below has to earn.
 *
 * ## One sign convention, stated once
 *
 * Everything here is in terms of the **fraction showing**: 1 is fully open, 0
 * is gone. Travel is how far the overlay has been pulled *away*, in pixels, and
 * is never negative. Velocity is pixels per millisecond and **positive means
 * away**, toward dismissal.
 *
 * Nothing here knows which direction "away" is, which is what lets `Drawer`
 * import it as well: a bottom sheet moves on its height and travels downward, a
 * left-hand drawer moves on its width and travels leftward, and each component
 * turns its own gesture into these two numbers. `extent` is "size along that
 * axis" for the same reason.
 *
 * For a bottom sheet the sign is not even a choice, which is worth using: a Web
 * `pointermove`'s `clientY` grows downward, and React Native's
 * `gestureState.vy` is positive downward and already in pixels per millisecond.
 * The two platforms agree, so the conversion nobody would remember to write does
 * not have to exist. A drawer negates one axis and is no harder.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * How far a flick carries after the finger leaves, in milliseconds of travel
 * at the release speed.
 *
 * `UIScrollView`'s normal deceleration rate is 0.998 per millisecond, and a
 * decaying velocity covers `v * rate / (1 - rate)` before it stops -- 499
 * milliseconds' worth. Written as the number rather than the division because
 * `1 - 0.998` is `0.0019999999999999575` and the quotient is not 499.
 *
 * It is a large multiplier on purpose: a deliberate flick of 1 px/ms projects
 * half a metre of phone screen, which is what makes a flick skip detents
 * instead of snapping back to the nearest one.
 */
export const PROJECTION_MS = 499

/**
 * The resting positions a sheet has, cleaned up.
 *
 * Ascending, deduplicated, and each one a fraction in `(0, 1]`. Zero is not a
 * detent -- a sheet resting at nothing is a closed sheet, and that is
 * `onClose`'s business rather than a position. An empty or unusable list
 * becomes `[1]`, because a sheet with no resting place cannot be rendered and
 * the one place every sheet has is open.
 */
export function normalizeDetents(detents: readonly number[] | undefined): number[] {
  const usable = (detents ?? []).filter(
    (detent) => Number.isFinite(detent) && detent > 0 && detent <= 1,
  )
  const sorted = [...new Set(usable)].sort((a, b) => a - b)
  return sorted.length === 0 ? [1] : sorted
}

/** The fraction showing when the overlay has been pulled `travel` px away. */
export function fractionAfter(travel: number, extent: number): number {
  if (!(extent > 0)) return 1
  return clamp(1 - travel / extent, 0, 1)
}

/** How far out the overlay sits when `fraction` of it is showing. */
export function travelFor(fraction: number, extent: number): number {
  if (!(extent > 0)) return 0
  return clamp(1 - fraction, 0, 1) * extent
}

/**
 * The fraction a live drag is allowed to reach.
 *
 * A sheet cannot be pulled up past its largest detent, because there is no more
 * sheet: dragging a half-height sheet to the top would show its bottom edge
 * floating in the middle of the screen. Away from open it is unclamped, all the
 * way to gone, because that is the dismissal.
 */
export function clampToDetents(fraction: number, detents: readonly number[] | undefined): number {
  const usable = normalizeDetents(detents)
  return clamp(fraction, 0, usable[usable.length - 1] as number)
}

export interface SheetRelease {
  /** The fraction showing at the moment the gesture ended. */
  fraction: number
  /** Speed away from open in px/ms at that moment; positive is toward dismissal. */
  velocity: number
  /**
   * The overlay's size along the axis it moves on, in px -- a bottom sheet's
   * height, a drawer's width. What turns a speed into a distance.
   */
  extent: number
  detents?: readonly number[]
  /**
   * The fraction below which a release dismisses rather than snapping.
   *
   * Defaults to half the lowest detent, so a sheet has to be pulled past the
   * midpoint of its smallest resting size before letting go throws it away.
   */
  dismissBelow?: number
}

/**
 * Where the sheet would come to rest if no detent caught it.
 *
 * Exported because it is the interesting half and the one worth testing on its
 * own: a slow drag projects almost nowhere and a flick projects further than
 * the sheet is tall. The projection is capped at the sheet's own extent for
 * that second case -- beyond it the answer is already "gone" or "open", and an
 * uncapped number would only make the arithmetic harder to read.
 */
export function projectedFraction(release: Omit<SheetRelease, 'detents' | 'dismissBelow'>): number {
  const { fraction, velocity, extent } = release
  if (!(extent > 0)) return clamp(fraction, 0, 1)
  const travel = travelFor(fraction, extent)
  const carried = clamp(velocity * PROJECTION_MS, -extent, extent)
  return fractionAfter(clamp(travel + carried, 0, extent), extent)
}

/**
 * The detent a release lands on, or `null` for "dismiss".
 *
 * `null` rather than 0 because dismissal is a different kind of answer: the
 * caller has an `onClose` to call and owns whether the sheet exists at all, and
 * a component that animated itself to zero height and stayed mounted would be a
 * sheet nobody can see and a reader still finds.
 *
 * Ties go to the larger detent. A release exactly between two resting sizes is
 * a person who has not decided, and the recoverable guess is the one that
 * leaves their content on screen.
 */
export function restingFraction(release: SheetRelease): number | null {
  const detents = normalizeDetents(release.detents)
  const lowest = detents[0] as number
  const floor = release.dismissBelow ?? lowest / 2
  const landed = projectedFraction(release)
  if (landed < floor) return null
  let best = detents[detents.length - 1] as number
  let bestGap = Number.POSITIVE_INFINITY
  for (const detent of detents) {
    const gap = Math.abs(detent - landed)
    // `<=` rather than `<`, over an ascending list, is the whole of the tie
    // rule: the last detent that is equally close wins, and that is the larger.
    if (gap <= bestGap) {
      best = detent
      bestGap = gap
    }
  }
  return best
}

function nearestIndex(value: number, detents: readonly number[]): number {
  let best = 0
  let bestGap = Number.POSITIVE_INFINITY
  for (let index = 0; index < detents.length; index += 1) {
    const gap = Math.abs((detents[index] as number) - value)
    if (gap < bestGap) {
      best = index
      bestGap = gap
    }
  }
  return best
}

/**
 * The detent one step up or down from where the sheet is, or `null` at the end.
 *
 * `null` rather than the current value, for the reason `movedBy` in
 * `slider-rules.ts` returns it: a caller needs to know whether it answered the
 * key, and a handle that swallowed ArrowUp at the top would trap a key the page
 * wanted for scrolling.
 */
export function nextDetent(
  current: number,
  detents: readonly number[] | undefined,
  direction: 1 | -1,
): number | null {
  const usable = normalizeDetents(detents)
  const next = nearestIndex(current, usable) + direction
  if (next < 0 || next >= usable.length) return null
  return usable[next] as number
}

/**
 * The next detent up, wrapping round to the smallest at the top.
 *
 * This is what a *press* on the handle does, and it exists because of WCAG
 * 2.5.7: resizing the sheet is functionality, dragging is how a pointer does
 * it, and a single tap has to be able to do it too. A cycle rather than a
 * toggle because there may be three detents, and `null` when there is only one
 * -- which is how the component knows whether the handle is a control at all.
 */
export function cycleDetent(
  current: number,
  detents: readonly number[] | undefined,
): number | null {
  const usable = normalizeDetents(detents)
  if (usable.length < 2) return null
  return usable[(nearestIndex(current, usable) + 1) % usable.length] as number
}
