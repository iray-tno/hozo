/**
 * A slider: a value on a scale, moved with a key or dragged with a pointer.
 *
 * The first control in this package with a pointer gesture in it. Everything
 * else here answers a click or a keystroke, both of which the browser already
 * turns into one event; a drag is a sequence, and the sequence has to survive
 * the pointer leaving the element it started on.
 *
 * `setPointerCapture` is what makes that true, and it is the whole reason
 * these are pointer events and not mouse events. Without it, dragging past
 * the end of the track stops updating the moment the cursor leaves -- which
 * is exactly when a person is trying hardest to reach the end. With it, the
 * track keeps receiving moves until the button comes up, wherever the pointer
 * has got to, and the same code handles touch and pen.
 *
 * ## What is on which element
 *
 * `role="slider"` is on the thumb, not on the track. The thumb is the thing
 * with a value and the thing that takes focus; the track is where it can go.
 * A reader announces the thumb, and `aria-valuetext` is there for the case
 * the number means nothing on its own -- "3" is not an answer to "how loud".
 *
 * The arithmetic is in `slider-rules.ts`, shared with the Native half, so the
 * two cannot disagree about where a drag lands.
 */

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useRef,
  useState,
} from 'react'
import { fractionAt, fractionOf, movedBy, type SliderRange, snap, valueAt } from './slider-rules.ts'

export interface HozoSliderProps extends Partial<SliderRange> {
  value?: number
  defaultValue?: number
  onValueChange?: (value: number) => void
  /**
   * Called when a drag or a key press finishes.
   *
   * For the caller who wants to save on release rather than on every frame of
   * a drag. `onValueChange` fires throughout; this fires once at the end.
   */
  onValueCommit?: (value: number) => void
  /**
   * What the value is called, when the number is not the answer.
   *
   * Becomes `aria-valuetext`. A volume of 3 out of 10 is better announced as
   * "30%", and a scale of 1 to 5 whose points have names is unusable without
   * this.
   */
  valueText?: (value: number) => string
  orientation?: 'horizontal' | 'vertical'
  disabled?: boolean
  accessibilityLabel?: string
  /** On the track, which is the element a pointer presses. */
  className?: string
  /** On the thumb, which is the element with the role and the focus. */
  thumbClassName?: string
  /**
   * On the filled part of the track, between `min` and the value.
   *
   * Rendered only when given, because this package ships no CSS and an empty
   * `<div>` nobody styled is one more thing in the accessibility tree for no
   * reason. It carries `aria-hidden`, being a picture of the value rather
   * than a second copy of it.
   */
  fillClassName?: string
  /**
   * On the track, for a style that is the value's meaning rather than a
   * look -- a colour picker's hue spectrum, which changes with the colour.
   * React Native's half has always taken one.
   */
  style?: CSSProperties
}

export function HozoSlider({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  valueText,
  min = 0,
  max = 100,
  step = 1,
  bigStep,
  orientation = 'horizontal',
  disabled,
  accessibilityLabel,
  className,
  thumbClassName,
  fillClassName,
  style,
}: HozoSliderProps) {
  const range: SliderRange = { min, max, step, bigStep }
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [uncontrolled, setUncontrolled] = useState(() => snap(defaultValue ?? min, range))
  const current = snap(value ?? uncontrolled, range)
  const vertical = orientation === 'vertical'

  const change = useCallback(
    (next: number) => {
      if (next === current) return
      if (value === undefined) setUncontrolled(next)
      onValueChange?.(next)
    },
    [current, onValueChange, value],
  )

  /** Where the pointer is, as a value. Reads the track's box on every move,
   * because a track can be resized by anything and a cached box is a drag
   * that lands somewhere else after a window resize. */
  const valueUnder = (event: PointerEvent<HTMLDivElement>): number | null => {
    const box = track.current?.getBoundingClientRect()
    if (!box) return null
    const rtl = readDirection(event.currentTarget) === 'rtl'
    return valueAt(
      fractionAt({ x: event.clientX, y: event.clientY }, box, { vertical, rtl }),
      range,
    )
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    // Captured on the way down, so every move until the release arrives here
    // whether or not the pointer is still over the track.
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    const next = valueUnder(event)
    if (next !== null) change(next)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || disabled) return
    const next = valueUnder(event)
    if (next !== null) change(next)
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    onValueCommit?.(current)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const next = movedBy(event.key, {
      ...range,
      value: current,
      rtl: readDirection(event.currentTarget) === 'rtl',
      vertical,
    })
    // Null is a key this slider does not answer, and it goes back to the page
    // unswallowed. A slider that ate PageUp without moving would trap it.
    if (next === null) return
    event.preventDefault()
    change(next)
    onValueCommit?.(next)
  }

  const fraction = fractionOf(current, range)

  return (
    <div
      ref={track}
      className={className}
      style={style}
      data-hozo-orientation={orientation}
      data-hozo-disabled={disabled ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {fillClassName === undefined ? null : (
        <div
          aria-hidden="true"
          className={fillClassName}
          style={{ [vertical ? 'height' : 'width']: `${fraction * 100}%` }}
        />
      )}
      <div
        role="slider"
        aria-label={accessibilityLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={valueText?.(current)}
        aria-orientation={orientation}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        className={thumbClassName}
        style={{ [vertical ? 'bottom' : 'insetInlineStart']: `${fraction * 100}%` }}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

/**
 * Which way the text runs, asked of the browser rather than of a prop.
 *
 * The same question `RadioGroup` asks, for the same reason: `dir` can be set
 * anywhere above the component and a prop would be a second answer that can
 * disagree with the first.
 */
function readDirection(element: Element): string {
  if (typeof window === 'undefined') return 'ltr'
  return window.getComputedStyle(element).direction || 'ltr'
}

export { HozoSlider as Slider, type HozoSliderProps as SliderProps }
