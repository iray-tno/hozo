import { useAnnounce, useHozoMessage } from '@hozo/behaviors'
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {
  clampedSize,
  remainingCharacters,
  shouldAnnounceCount,
  usableLineHeight,
} from './text-area-rules.ts'

export interface HozoTextAreaProps {
  value?: string
  defaultValue?: string
  onChangeText?: (text: string) => void
  placeholder?: string
  /** The field's accessible name, when no `Field` is supplying one. */
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  /**
   * The three attributes a `Field` hands its control, spelled the way it spells
   * them so that `{...control}` works.
   *
   * There is deliberately no `invalid` or `required` prop beside them. `Input`
   * recorded why: a `Field` already puts `aria-invalid` on its control, so a
   * second prop meaning the same thing is a second source of truth, and the
   * disagreement is a field that looks fine and announces itself as wrong. The
   * look follows the attribute -- `aria-invalid:border-hozo-danger` -- rather
   * than a prop.
   *
   * `aria-required` rather than the real `required`, also following `Field`: the
   * attribute tells a reader without handing the browser's own validation
   * bubble a say in when the form submits.
   */
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
  /**
   * Whether the field grows with its text. True, which is the whole point.
   *
   * False leaves a plain resizable textarea, which is what somebody wants when
   * the field sits in a layout that cannot take a changing height.
   */
  autoGrow?: boolean
  /** Never shorter than this many rows. Two by default: a textarea that looks like one. */
  minRows?: number
  /** Never taller than this many rows; past it the field scrolls instead of growing. */
  maxRows?: number
  maxLength?: number
  /**
   * How the character count reads. Given the remaining count and the limit.
   *
   * A function rather than a string, because "7 characters left" is English and
   * the number is in the middle of it.
   */
  formatCount?: (remaining: number, maxLength: number) => string
  /** How few characters left is worth announcing unprompted. Ten by default. */
  announceRemaining?: number
  disabled?: boolean
  readOnly?: boolean
  name?: string
  id?: string
  rows?: number
  className?: string
  fieldClassName?: string
  countClassName?: string
  testID?: string
  onBlur?: () => void
  onFocus?: () => void
}

/**
 * `useLayoutEffect`, except on a server, where there is no layout to be before.
 *
 * React warns about `useLayoutEffect` during a server render, and it is right to:
 * the effect never runs, so anything that depended on it is missing from the
 * markup. Here nothing is -- `rows` gives the first paint its minimum height and
 * the measurement only refines it -- so the warning is noise and this is how it
 * is silenced without pretending the two hooks are the same.
 */
const useMeasureEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

/**
 * A multiline field that grows with what is typed into it.
 *
 * #143's first control, and the one whose Web and Native halves measure
 * genuinely different things: `scrollHeight` here, `onContentSizeChange` there.
 * `text-area-rules.ts` takes both in the same shape -- a content height, a line
 * height, and the padding that is not text -- so the question "how tall is four
 * rows" has one answer on both platforms.
 *
 * ## Why not `field-sizing: content`
 *
 * One CSS declaration does the growing, with no measurement and no effect, and
 * it is where this should end up. It is not here yet because `maxRows` still
 * needs a cap in line units and because a component that uses it where it exists
 * and measures where it does not has two behaviours to verify rather than one.
 * When the floor rises, this file gets shorter and `text-area-rules.ts` survives
 * -- which is the argument for the arithmetic living outside the component.
 *
 * ## The height is set in a layout effect, not a render
 *
 * A textarea's content height cannot be known before it has been laid out with
 * the new text in it, so the order is: let the value land, measure, set the
 * height. `useLayoutEffect` rather than `useEffect` so the two happen in one
 * frame; the alternative is a visible jump on every line break.
 *
 * ## The character count is not a live region
 *
 * #143 asks for the count to be read with `aria-live`, and the direct reading of
 * that interrupts a reader on every keystroke. So the count is rendered as text
 * and attached with `aria-describedby`, where it is read when the field is
 * reached and is available on demand, and an unprompted announcement happens at
 * most twice: entering the last few characters, and running out. The rule is
 * `shouldAnnounceCount`, where it can be tested without a screen reader.
 */
export function HozoTextArea({
  value: controlled,
  defaultValue = '',
  onChangeText,
  placeholder,
  accessibilityLabel,
  accessibilityLabelledBy,
  autoGrow = true,
  minRows = 2,
  maxRows,
  maxLength,
  formatCount: formatCountProp,
  announceRemaining = 10,
  disabled,
  readOnly,
  'aria-describedby': describedByProp,
  'aria-invalid': invalid,
  'aria-required': required,
  name,
  id,
  rows,
  className,
  fieldClassName,
  countClassName,
  testID,
  onBlur,
  onFocus,
}: HozoTextAreaProps) {
  // The count from the prop, then the project's i18n, then English
  // (decision 008). Held stable, because announcing it is an effect on it.
  const message = useHozoMessage()
  const formatCount = useCallback(
    (remaining: number, maxLength: number) =>
      formatCountProp
        ? formatCountProp(remaining, maxLength)
        : message('hozo.textArea.remaining', { remaining, maxLength }),
    [formatCountProp, message],
  )
  const generated = useId()
  const fieldId = id ?? `${generated}-field`
  const countId = `${generated}-count`
  const ref = useRef<HTMLTextAreaElement>(null)
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const text = controlled ?? uncontrolled
  const [size, setSize] = useState<{ height: number; scrollable: boolean } | null>(null)

  const remaining = remainingCharacters(text, maxLength)
  const announced = useRef<number | null>(null)
  const announce = useAnnounce()

  const measure = useCallback(() => {
    const field = ref.current
    if (!field || !autoGrow) return
    const styles = getComputedStyle(field)
    const lineHeight = usableLineHeight(
      Number.parseFloat(styles.lineHeight),
      Number.parseFloat(styles.fontSize),
    )
    const padding =
      Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom) || 0
    const borders =
      Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth) || 0
    // `scrollHeight` is the content plus the padding, and it only reports the
    // text's own height while the element is not already tall enough to hold it
    // -- hence `auto` first. Put back immediately rather than left for the next
    // render: when the measurement is unchanged React has nothing to re-render,
    // and the field would be left at `auto` and shrink to its `rows`.
    const held = field.style.height
    field.style.height = 'auto'
    const content = field.scrollHeight - padding
    field.style.height = held
    setSize(clampedSize({ content, lineHeight, extra: padding + borders, minRows, maxRows }))
  }, [autoGrow, maxRows, minRows])

  // Every render that could change the text, which includes a controlled value
  // arriving from outside and the first paint.
  useMeasureEffect(measure, [measure, text])

  useEffect(() => {
    if (
      !shouldAnnounceCount({ previous: announced.current, remaining, threshold: announceRemaining })
    ) {
      announced.current = remaining
      return
    }
    announced.current = remaining
    if (remaining !== null && maxLength !== undefined) announce(formatCount(remaining, maxLength))
  }, [announce, announceRemaining, formatCount, maxLength, remaining])

  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.currentTarget.value
    if (controlled === undefined) setUncontrolled(next)
    onChangeText?.(next)
  }

  const counter: ReactNode =
    remaining === null || maxLength === undefined ? null : (
      <span id={countId} className={countClassName}>
        {formatCount(remaining, maxLength)}
      </span>
    )

  // The count describes the field, and so may something the caller passed. Both,
  // in that order, because a limit is the less important of the two and a
  // description a caller wrote should be heard first.
  const describedBy =
    [describedByProp, counter === null ? undefined : countId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <textarea
        ref={ref}
        id={fieldId}
        name={name}
        value={text}
        rows={rows ?? minRows}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={readOnly}
        aria-required={required ? true : undefined}
        aria-invalid={invalid ? 'true' : undefined}
        aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
        aria-labelledby={accessibilityLabelledBy}
        aria-describedby={describedBy}
        data-hozo-disabled={disabled ? '' : undefined}
        data-testid={testID}
        className={fieldClassName}
        // Inline because these are the two things the growing *is*, not how it
        // looks: a height that came from a measurement, and an overflow that
        // changes the instant the field stops growing. `rows` already gives the
        // server-rendered first paint its minimum, so nothing jumps before the
        // first measurement lands.
        style={
          autoGrow && size
            ? { height: `${size.height}px`, overflowY: size.scrollable ? 'auto' : 'hidden' }
            : undefined
        }
        onChange={change}
        onBlur={onBlur}
        onFocus={onFocus}
      />
      {counter}
    </div>
  )
}

export { HozoTextArea as TextArea, type HozoTextAreaProps as TextAreaProps }
