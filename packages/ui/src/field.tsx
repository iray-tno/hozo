/**
 * A label, a control, a description and an error, wired to each other.
 *
 * The wiring is the whole component. Four elements have to know four ids
 * between them -- a `<label for>`, an `aria-describedby` that names both the
 * description and the error, and an `aria-invalid` that agrees with whether
 * there is one -- and every one of those is something an application gets
 * right on the form it is thinking about and wrong on the other six.
 *
 * It adds no behaviour, which is this package's rule (#638 §2). It generates
 * ids and passes them down; the control is the caller's and stays the
 * caller's, which is why the children are a render prop rather than a
 * `<Field><input /></Field>`. The alternative -- cloning the child to add
 * props -- works until somebody wraps their input in a div.
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
 * Measured rather than argued in the end: the Storybook story has a field
 * with an error in its initial state, so the approved reading order says what
 * the virtual reader does with it.
 *
 * ## Order inside `aria-describedby`
 *
 * The error first, then the description. A reader reads them in the order the
 * attribute lists, and somebody who has just been told their input is wrong
 * wants to know why before being told the rules again.
 */

import { type ReactNode, useId } from 'react'

/** What a control needs to be part of a field. */
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
  /** The control, given the ids it has to carry. */
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
  descriptionClassName?: string
  errorClassName?: string
}

const shell = 'flex flex-col gap-2'
const labelText = 'text-sm font-medium text-hozo-text'
const describeText = 'text-sm text-hozo-text-muted'
const errorText = 'text-sm font-medium text-hozo-danger-text'

export function HozoField({
  label,
  children,
  description,
  error,
  required,
  className,
  labelClassName,
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
    <div className={className ? `${shell} ${className}` : shell}>
      <label htmlFor={id} className={labelClassName ? `${labelText} ${labelClassName}` : labelText}>
        {label}
        {required ? (
          // Decoration. `aria-required` on the control is what a reader uses,
          // and a star that a reader announced as "asterisk" would be worse
          // than one it ignores.
          <span aria-hidden="true" className="text-hozo-danger">
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
        <span
          id={`${base}-error`}
          role="alert"
          className={errorClassName ? `${errorText} ${errorClassName}` : errorText}
        >
          {error}
        </span>
      )}
      {description === undefined ? null : (
        <span
          id={`${base}-hint`}
          className={
            descriptionClassName ? `${describeText} ${descriptionClassName}` : describeText
          }
        >
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
