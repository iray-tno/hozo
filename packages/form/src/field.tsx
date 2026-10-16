/**
 * A label, a control, a description and an error, wired to each other.
 *
 * The wiring is the whole component. Four elements have to know four ids
 * between them -- a `<label for>`, an `aria-describedby` that names both the
 * description and the error, and an `aria-invalid` that agrees with whether
 * there is one -- and every one of those is something an application gets
 * right on the form it is thinking about and wrong on the other six.
 *
 * It lives here rather than in `@hozo/ui` because the wiring is different on
 * each platform (#983): React Native has no `for`, no `aria-describedby`, and
 * a labelling reference on Android only. `field.native.tsx` is the other half.
 * The look is not this file's -- every part takes a class list, and
 * `@hozo/ui` is the layer that fills them in.
 *
 * The control is the caller's and stays the caller's, which is why the
 * children are a render prop rather than a `<Field><input /></Field>`. The
 * alternative -- cloning the child to add props -- works until somebody wraps
 * their input in a div.
 *
 * ## The error is announced, and that is a choice
 *
 * It carries `role="alert"`, so a reader says it when it appears. The cost is
 * that a field rendered with an error already on it announces at mount, which
 * is right for a form that came back from a server and noisy for one that
 * restores a draft. `aria-live="polite"` on a container that is always
 * present would trade that the other way, and needs an empty element in the
 * tree for every field that has no error.
 *
 * ## Order inside `aria-describedby`
 *
 * The error first, then the description. A reader reads them in the order the
 * attribute lists, and somebody who has just been told their input is wrong
 * wants to know why before being told the rules again.
 */

import { type ReactNode, useId } from 'react'

/** What a control needs to be part of a field, on the Web. */
export interface HozoFieldControl {
  /** Put this on the control, so the label points at it. */
  id: string
  /** Put this on the control; it names the error and the description. */
  'aria-describedby': string | undefined
  /** True when there is an error, so a reader says the control is invalid. */
  'aria-invalid': true | undefined
  /** True when the field is required, which is what a reader uses. */
  'aria-required': true | undefined
}

export interface HozoFieldProps {
  label: ReactNode
  /**
   * The control's name where `label` is not a string.
   *
   * Unused on the Web, where the `<label>` names the control whatever it
   * contains. React Native on iOS can only be given a string (see
   * `field.native.tsx`), so a field whose label is an element says it here.
   */
  accessibilityLabel?: string
  /** The control, given what it has to carry. */
  children: (control: HozoFieldControl) => ReactNode
  /** The rules, the format, the example. Read after the error. */
  description?: ReactNode
  /** What is wrong. Its presence is what makes the field invalid. */
  error?: ReactNode
  /**
   * Marks the label and tells a reader.
   *
   * The asterisk is a convention a reader cannot rely on, so `aria-required`
   * goes on the control and the mark is decoration beside the text.
   */
  required?: boolean
  className?: string
  labelClassName?: string
  requiredClassName?: string
  descriptionClassName?: string
  errorClassName?: string
}

export function HozoField({
  label,
  children,
  description,
  error,
  required,
  className,
  labelClassName,
  requiredClassName,
  descriptionClassName,
  errorClassName,
}: HozoFieldProps) {
  const base = useId()
  const id = `${base}-control`
  const describedBy =
    [
      error === undefined ? null : `${base}-error`,
      description === undefined ? null : `${base}-hint`,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className={className}>
      <label htmlFor={id} className={labelClassName}>
        {label}
        {required ? (
          // Decoration. `aria-required` on the control is what a reader uses,
          // and a star that a reader announced as "asterisk" would be worse
          // than one it ignores.
          <span aria-hidden="true" className={requiredClassName}>
            {' *'}
          </span>
        ) : null}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error === undefined ? undefined : true,
        'aria-required': required === true ? true : undefined,
      })}
      {error === undefined ? null : (
        <span id={`${base}-error`} role="alert" className={errorClassName}>
          {error}
        </span>
      )}
      {description === undefined ? null : (
        <span id={`${base}-hint`} className={descriptionClassName}>
          {description}
        </span>
      )}
    </div>
  )
}

export {
  HozoField as Field,
  type HozoFieldControl as FieldControl,
  type HozoFieldProps as FieldProps,
}
