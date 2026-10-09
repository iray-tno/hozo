import { useHozoMessage } from '@hozo/behaviors'
import { type ChangeEvent, useId, useState } from 'react'
import { type OtpType, otpActiveIndex, otpValue } from './otp-rules.ts'

export type { OtpType }

export interface HozoOtpInputProps {
  /** How many characters the code has; 6 by default. */
  length?: number
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  /** Called once the code is whole, with the code. */
  onComplete?: (value: string) => void
  /** `'number'` keeps digits and brings up a number pad; `'text'` keeps letters too. */
  type?: OtpType
  /** Draws a dot for each character and enters it as a password, for a PIN. */
  mask?: boolean
  autoFocus?: boolean
  disabled?: boolean
  /** The field's name -- "Verification code". Required: a field with none is a field nobody can find. */
  accessibilityLabel: string
  /** The box that holds the cells. */
  className?: string
  /** Every cell. */
  cellClassName?: string
  /** Added to the cell the next character goes into, while the field has focus. */
  activeCellClassName?: string
  /** Added to every cell holding a character. */
  filledCellClassName?: string
  /**
   * The input itself, which is the element that takes focus: where a
   * `focus-visible:` ring goes. Web only -- on React Native focus is the
   * keyboard and the active cell, and there is no ring to draw.
   */
  inputClassName?: string
  testID?: string
}

/**
 * A one-time code or a PIN (#149): one real input, drawn as cells.
 *
 * ## One field, not six
 *
 * A code split across six inputs is six fields to a screen reader, none of
 * them named for what it is, and it is the shape that breaks the operating
 * system's offer to fill a code from a text message, which fills one field.
 * So this is a single input -- `autocomplete="one-time-code"`, a number pad
 * where the code is digits -- and the cells are drawn over it and hidden from
 * assistive technology. A reader hears "Verification code, 6 characters" and
 * the characters as they are typed; a paste or an autofill of the whole code
 * lands at once, because that is what an input does with one. Moving to the
 * next cell and Backspace back to the last are the input's own behaviour, not
 * focus handed between elements.
 *
 * The input is transparent and laid over the cells, so a press on any cell is
 * a press on the field. Its caret is hidden and drawn by the cell the next
 * character goes into (`activeCellClassName`); its focus outline is the
 * browser's own, round the whole field, so focus is visible whatever the
 * cells look like.
 *
 * ## State is styled by class lists, not selectors
 *
 * `activeCellClassName` and `filledCellClassName` are added by this component,
 * for the reason `Pagination` gives: React Native has no selector for them.
 */
export function HozoOtpInput({
  length = 6,
  value,
  defaultValue,
  onChange,
  onComplete,
  type = 'number',
  mask = false,
  autoFocus,
  disabled,
  accessibilityLabel,
  className,
  cellClassName,
  activeCellClassName,
  filledCellClassName,
  inputClassName,
  testID,
}: HozoOtpInputProps) {
  const message = useHozoMessage()
  const hintId = useId()
  const [uncontrolled, setUncontrolled] = useState(() => otpValue(defaultValue ?? '', length, type))
  const [focused, setFocused] = useState(false)
  const code = value !== undefined ? otpValue(value, length, type) : uncontrolled
  const characters = Array.from(code)
  const active = otpActiveIndex(code, length)

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const next = otpValue(event.target.value, length, type)
    if (value === undefined) setUncontrolled(next)
    onChange?.(next)
    if (Array.from(next).length === length && next !== code) onComplete?.(next)
  }

  return (
    <div className={className} style={BOX} data-testid={testID}>
      <input
        type={mask ? 'password' : 'text'}
        inputMode={type === 'number' ? 'numeric' : 'text'}
        autoComplete="one-time-code"
        pattern={type === 'number' ? '[0-9]*' : undefined}
        maxLength={length * 2}
        value={code}
        onChange={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // biome-ignore lint/a11y/noAutofocus: an author asks for it, on a screen whose only job is this code
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={accessibilityLabel}
        aria-describedby={hintId}
        className={inputClassName}
        style={INPUT}
      />
      <span id={hintId} hidden>
        {message('hozo.otpInput.hint', { length })}
      </span>
      {Array.from({ length }, (_, position) => position).map((index) => {
        const character = characters[index]
        const classes =
          [
            cellClassName,
            focused && index === active && activeCellClassName,
            character !== undefined && filledCellClassName,
          ]
            .filter(Boolean)
            .join(' ') || undefined
        return (
          <span
            key={index}
            aria-hidden
            className={classes}
            data-hozo-filled={character !== undefined ? '' : undefined}
          >
            {character === undefined ? '' : mask ? '•' : character}
          </span>
        )
      })}
    </div>
  )
}

/** The input covers the cells, so the box it is laid over has to be its reference. */
const BOX = { position: 'relative', display: 'inline-flex' } as const

/**
 * Over the cells and invisible: its text and caret are drawn by the cells
 * instead. Its focus outline is kept, and runs round the whole field. Not `opacity: 0`, which some autofill bars and password
 * managers read as "not there". Inline because it is behaviour, not look.
 */
const INPUT = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'transparent',
  caretColor: 'transparent',
  fontSize: 16,
  letterSpacing: '-1em',
} as const

export { HozoOtpInput as OtpInput, type HozoOtpInputProps as OtpInputProps }
