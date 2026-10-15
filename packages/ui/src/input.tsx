/**
 * A text field with a look, wrapping the `TextInput` primitive.
 *
 * The one `Field` was missing. A field wires a label, a description and an
 * error to a control it does not supply, so until now an application using
 * both had to write the control's class list itself -- which is the styling
 * this package exists to have already done, and which the demo's story was
 * doing by hand.
 *
 * No independent state, as ever (#638 §2): `multiline`, `value`, `onChangeText` and
 * the rest belong to the primitive and pass straight through, including the
 * `id`, `aria-describedby`, `aria-invalid` and `aria-required` a `Field`
 * hands its child.
 *
 * ## `aria-invalid` styles it, and TypeScript does not
 *
 * The error border comes from `aria-[invalid=true]:border-hozo-danger` rather than
 * from an `invalid` prop. A `Field` already puts that attribute on its
 * control, so the two agree by construction; an `invalid` prop would be a
 * second source of truth that can disagree with the first, and the disagreement
 * would be a control that looks fine and announces itself as wrong.
 */

import { TextInput, type TextInputProps } from '@hozo/primitives'
import clsx from 'clsx'

export interface HozoInputProps extends TextInputProps {
  /**
   * A textarea rather than a single line.
   *
   * The primitive's own prop, named here only so the height that goes with
   * it can be. A multiline input with one line's height is the shape people
   * report as a bug.
   */
  multiline?: boolean
}

/**
 * A literal inside `clsx` lets the compiler keep the library's state styles
 * static even when the caller adds a dynamic className, just like Button.
 * Each branch has its own literal: Web needs a statically known `multiline`
 * to choose textarea rather than input. Named props below supply the real
 * state drivers rather than guessing from `rest`.
 *
 * No drag-to-resize handle on either platform: `resize-none` removes the
 * browser handle and asks for what RN already does. `resize-y` is still
 * refused on Native, not silently ignored. Use TextArea for measured growth.
 * The disabled cursor is `auto`, the same portable choice as Button; RN
 * cannot express `not-allowed`.
 */
export function HozoInput({
  multiline,
  className,
  disabled,
  editable,
  readOnly,
  'aria-invalid': invalid,
  ...rest
}: HozoInputProps) {
  if (multiline === true) {
    return (
      <TextInput
        {...rest}
        multiline={true}
        disabled={disabled}
        editable={editable}
        readOnly={readOnly}
        aria-invalid={invalid}
        className={clsx(
          'w-full rounded-hozo-control border bg-hozo-surface px-3 py-2 text-sm text-hozo-text border-hozo-border-strong placeholder:text-hozo-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-[invalid=true]:border-hozo-danger disabled:bg-hozo-surface-raised disabled:text-hozo-text-subtle disabled:cursor-auto resize-none min-h-24',
          className,
        )}
      />
    )
  }
  return (
    <TextInput
      {...rest}
      multiline={false}
      disabled={disabled}
      editable={editable}
      readOnly={readOnly}
      aria-invalid={invalid}
      className={clsx(
        'w-full rounded-hozo-control border bg-hozo-surface px-3 py-2 text-sm text-hozo-text border-hozo-border-strong placeholder:text-hozo-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-[invalid=true]:border-hozo-danger disabled:bg-hozo-surface-raised disabled:text-hozo-text-subtle disabled:cursor-auto resize-none',
        className,
      )}
    />
  )
}

export { HozoInput as Input, type HozoInputProps as InputProps }
