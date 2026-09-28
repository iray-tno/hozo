/**
 * The arithmetic a slider is, with no element in it.
 *
 * Split out for the reason `tree-rules.ts` and `combobox-rules.ts` are: the
 * hard part of a slider is not the markup, and a test that has to render
 * something to ask "what is 0.37 of 0 to 7, in steps of 0.5" is a test that
 * will not be written. Both halves of the component import this, so the Web
 * and the Native slider cannot disagree about where a drag lands.
 */

export interface SliderRange {
  min: number
  max: number
  /** The smallest change a key or a drag can make. Must be greater than zero. */
  step: number
  /** What PageUp and PageDown move by. Defaults to ten steps. */
  bigStep?: number
}

/** Keys a slider answers. Anything else is given back to the page. */
export type SliderKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'PageUp'
  | 'PageDown'
  | 'Home'
  | 'End'

/**
 * How many decimals a step implies.
 *
 * `0.1 + 0.2` is `0.30000000000000004`, and a slider that reports that as its
 * value has an `aria-valuenow` no reader should have to say out loud. The
 * step is the caller's statement of how precise the scale is, so it is also
 * the answer to how many decimals to keep.
 *
 * Read off the decimal text rather than computed, because `Math.log10(0.001)`
 * is `-2.9999999999999996` and the same class of error would be back.
 */
function decimals(step: number): number {
  const text = String(step)
  const point = text.indexOf('.')
  if (point === -1) return 0
  // `1e-7` prints as "1e-7", which has no point and a negative exponent.
  const exponent = /e-(\d+)$/.exec(text)
  if (exponent) return Number(exponent[1]) + (point === -1 ? 0 : text.length - point - 1)
  return text.length - point - 1
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * The nearest value on the scale, clamped to it.
 *
 * Snapping is from `min` rather than from zero, because a range of 1 to 10 in
 * steps of 3 has 1, 4, 7, 10 on it and not 3, 6, 9. `max` is included even
 * when the step does not divide the range evenly -- a slider whose right-hand
 * end cannot be reached is a bug people report, and the alternative is a last
 * step that is shorter than the others, which nobody notices.
 */
export function snap(value: number, range: SliderRange): number {
  const { min, max, step } = range
  if (!(step > 0)) return clamp(value, min, max)
  const wanted = clamp(value, min, max)
  const steps = Math.round((wanted - min) / step)
  const landed = Number((min + steps * step).toFixed(decimals(step)))
  if (landed >= max) return max
  // `max` is on the scale whether or not the step reaches it, so it competes
  // with the nearest step rather than being unreachable. Without this line a
  // range of 0 to 10 in threes has no way to say 10 -- the last step is 9 and
  // everything above it rounds back down to it.
  return Math.abs(max - wanted) < Math.abs(wanted - landed) ? max : landed
}

/** Where a value sits on the track, 0 at `min` and 1 at `max`. */
export function fractionOf(value: number, range: SliderRange): number {
  const { min, max } = range
  if (max === min) return 0
  return clamp((value - min) / (max - min), 0, 1)
}

/** The value a fraction of the track lands on, snapped to the scale. */
export function valueAt(fraction: number, range: SliderRange): number {
  const { min, max } = range
  return snap(min + clamp(fraction, 0, 1) * (max - min), range)
}

export interface SliderMove extends SliderRange {
  value: number
  /**
   * Whether the track runs right to left.
   *
   * Only the two horizontal arrows care. Up is more and Down is less
   * everywhere, because a vertical slider is not mirrored by writing
   * direction, and Home and End are the ends of the scale rather than of the
   * screen.
   */
  rtl?: boolean
  /** A vertical track. Up is still more; Left and Right still work. */
  vertical?: boolean
}

/**
 * What a key does to the value, or `null` if the slider does not answer it.
 *
 * Null rather than the value unchanged, so a caller knows whether to call
 * `preventDefault`. A slider that swallowed PageUp without moving would trap
 * a key the page wanted.
 */
export function movedBy(key: SliderKey | string, move: SliderMove): number | null {
  const { value, min, max, step, bigStep = step * 10, rtl = false } = move
  const range: SliderRange = { min, max, step }

  if (key === 'Home') return min
  if (key === 'End') return max
  if (key === 'PageUp') return snap(value + bigStep, range)
  if (key === 'PageDown') return snap(value - bigStep, range)
  if (key === 'ArrowUp') return snap(value + step, range)
  if (key === 'ArrowDown') return snap(value - step, range)
  // The only two that mirror. In a right-to-left track the right-hand end is
  // the low end, so the key that points at it lowers the value.
  if (key === 'ArrowRight') return snap(value + (rtl ? -step : step), range)
  if (key === 'ArrowLeft') return snap(value - (rtl ? -step : step), range)
  return null
}

/**
 * The fraction a pointer at `position` picked, given the track's box.
 *
 * `position` and the box are in the same coordinate space, whichever that is
 * -- client coordinates on the Web, view coordinates on React Native -- so
 * this does not need to know which platform it is on.
 *
 * A vertical track is measured from its bottom, because up is more.
 */
export function fractionAt(
  position: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  options: { vertical?: boolean; rtl?: boolean } = {},
): number {
  const { vertical = false, rtl = false } = options
  if (vertical) {
    if (box.height === 0) return 0
    return clamp((box.top + box.height - position.y) / box.height, 0, 1)
  }
  if (box.width === 0) return 0
  const fraction = (position.x - box.left) / box.width
  return clamp(rtl ? 1 - fraction : fraction, 0, 1)
}
