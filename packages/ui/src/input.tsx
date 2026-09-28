/**
 * A text field with a look, wrapping the `TextInput` primitive.
 *
 * The one `Field` was missing. A field wires a label, a description and an
 * error to a control it does not supply, so until now an application using
 * both had to write the control's class list itself -- which is the styling
 * this package exists to have already done, and which the demo's story was
 * doing by hand.
 *
 * No behaviour, as ever (#638 §2): `multiline`, `value`, `onChangeText` and
 * the rest belong to the primitive and pass straight through, including the
 * `id`, `aria-describedby`, `aria-invalid` and `aria-required` a `Field`
 * hands its child.
 *
 * ## `aria-invalid` styles it, and TypeScript does not
 *
 * The error border comes from `aria-invalid:border-hozo-danger` rather than
 * from an `invalid` prop. A `Field` already puts that attribute on its
 * control, so the two agree by construction; an `invalid` prop would be a
 * second source of truth that can disagree with the first, and the disagreement
 * would be a control that looks fine and announces itself as wrong.
 */

import { TextInput, type TextInputProps } from '@hozo/primitives'

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
 * Both lists written out, for the reason `button.tsx` gives: Hozo compiles a
 * `className` it can read statically into a rule, and falls back to the
 * project-wide candidate sheet for one it has to join at runtime. A library
 * whose own classes take the fallback path would be arguing against itself.
 */
const oneLine =
  'w-full rounded-hozo-control border bg-hozo-surface px-3 py-2 text-sm text-hozo-text border-hozo-border-strong placeholder:text-hozo-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-invalid:border-hozo-danger disabled:bg-hozo-surface-raised disabled:text-hozo-text-subtle disabled:cursor-not-allowed'

const manyLines =
  'w-full rounded-hozo-control border bg-hozo-surface px-3 py-2 text-sm text-hozo-text border-hozo-border-strong placeholder:text-hozo-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-invalid:border-hozo-danger disabled:bg-hozo-surface-raised disabled:text-hozo-text-subtle disabled:cursor-not-allowed min-h-24 resize-y'

export function HozoInput({ multiline, className, ...rest }: HozoInputProps) {
  const own = multiline === true ? manyLines : oneLine
  return (
    <TextInput
      {...rest}
      multiline={multiline}
      className={className ? `${own} ${className}` : own}
    />
  )
}

export { HozoInput as Input, type HozoInputProps as InputProps }
