/**
 * A field with a look, wearing `@hozo/form`.
 *
 * The wiring is theirs: a `<label for>`, an `aria-describedby` with the error
 * first, `role="alert"` on the error, on the Web; a `nativeID` the control is
 * labelled by, the label as a string for iOS, and a hint, on React Native.
 * That differs per platform, which is why it moved out of this package
 * (#983) -- it used to be written here in HTML, and a `<div>` does not exist
 * on a phone. What is left is the look: a column, a label in the body's
 * weight, a muted description and an error in the danger colour.
 */

import {
  Field as FieldPattern,
  type FieldProps,
  type FieldControl as HozoFieldControl,
} from '@hozo/form'

export type { HozoFieldControl }
export type HozoFieldProps = Omit<FieldProps, 'requiredClassName'>

const shell = 'flex flex-col gap-2'
const labelText = 'text-sm font-medium text-hozo-text'
const requiredMark = 'text-hozo-danger'
const describeText = 'text-sm text-hozo-text-muted'
const errorText = 'text-sm font-medium text-hozo-danger-text'

export function HozoField({
  className,
  labelClassName,
  descriptionClassName,
  errorClassName,
  ...rest
}: HozoFieldProps) {
  return (
    <FieldPattern
      {...rest}
      className={className ? `${shell} ${className}` : shell}
      labelClassName={labelClassName ? `${labelText} ${labelClassName}` : labelText}
      requiredClassName={requiredMark}
      descriptionClassName={
        descriptionClassName ? `${describeText} ${descriptionClassName}` : describeText
      }
      errorClassName={errorClassName ? `${errorText} ${errorClassName}` : errorText}
    />
  )
}

export {
  HozoField as Field,
  type HozoFieldControl as FieldControl,
  type HozoFieldProps as FieldProps,
}
