// When a measurement has moved, for a layout that feeds its own input.
//
// `HozoGrid` and `HozoContainer` both read a box back from `onLayout` and
// store it, and both then render something whose size depends on what they
// stored. That loop is fine while the number comes back the same. It does
// not always: `onLayout` reports floats, and 372.99998 and 373.00002 are
// different numbers to `===` and the same width to everyone else.
//
// The grid found this the hard way. On an emulator its screen never
// stopped drawing -- `uiautomator dump` could not find an idle window
// across six attempts and the frame counter climbed by about twenty-four a
// second with nobody touching it -- and a screenshot showed the screen
// half-built, stopped inside the grid. The guard existed on the heights it
// measured and not on the width, two adjacent lines apart.
//
// So the rule lives here rather than as a constant copied into each. Both
// components had their own idea of what "unchanged" meant, and one of them
// was wrong; a second copy of the fix would be the same bet again.

/**
 * How far a measurement has to move before it counts as having moved.
 *
 * Half a device pixel: below anything a track size or a container query can
 * express, and above the noise a Yoga pass produces.
 */
export const SETTLED = 0.5

/**
 * The value to keep, given what is stored and what was just measured.
 *
 * Returns `current` when the two are the same size, so React bails out of
 * the render rather than starting the next lap. A tolerance rather than a
 * lock: a rotation moves a width by hundreds of pixels and the layout still
 * has to follow it.
 *
 * `undefined` and `NaN` both count as moved, which is what an unmeasured
 * box should do -- it has no size yet, so any size is news.
 */
export function keepIfSettled(current: number | undefined, measured: number): number {
  if (current === undefined) return measured
  return Math.abs(current - measured) < SETTLED ? current : measured
}
