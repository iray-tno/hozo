/**
 * A code input with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is the pattern's: one real input under the cells, so a
 * reader finds one field and a code from a text message fills it at once.
 * This file draws a row of square cells on the 4px grid, and marks the one
 * the next character goes into through the pattern's state class lists,
 * which reach React Native as well.
 */

import { OtpInput, type OtpInputProps } from '@hozo/core'

export type HozoOtpInputProps = OtpInputProps

const row = 'flex flex-row gap-2 rounded-hozo-control'
const cell =
  'size-11 items-center justify-center rounded-hozo-control border border-hozo-border-strong bg-hozo-surface text-lg font-medium text-hozo-text'
const active = 'border-2 border-hozo-accent'
const filled = 'border-hozo-border-strong'
const input =
  'rounded-hozo-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'

const plus = (own: string, extra: string | undefined) => (extra ? `${own} ${extra}` : own)

// Not named `HozoOtpInput` here: compiled output imports a runtime component
// under that name for the `<OtpInput>` below (#670).
function StyledOtpInput({
  className,
  cellClassName,
  activeCellClassName,
  filledCellClassName,
  inputClassName,
  ...rest
}: HozoOtpInputProps) {
  return (
    <OtpInput
      {...rest}
      className={plus(row, className)}
      cellClassName={plus(cell, cellClassName)}
      activeCellClassName={plus(active, activeCellClassName)}
      filledCellClassName={plus(filled, filledCellClassName)}
      inputClassName={plus(input, inputClassName)}
    />
  )
}

export {
  type HozoOtpInputProps as OtpInputProps,
  StyledOtpInput as HozoOtpInput,
  StyledOtpInput as OtpInput,
}
