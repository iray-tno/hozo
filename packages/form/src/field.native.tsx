/**
 * A field on React Native, where nothing points at anything (#983).
 *
 * The Web half wires four elements with ids. Here:
 *
 * - **The label** is a `Text` with a `nativeID`, and the control is handed
 *   `accessibilityLabelledBy` -- which React Native implements on Android
 *   only. iOS has no labelling reference at all, so the control is also
 *   handed the label as `accessibilityLabel`, a string. A label that is an
 *   element has no string to give, which is what the `accessibilityLabel`
 *   prop is for; without either the control is unnamed on iOS, and that is
 *   said once in development.
 * - **The error and the description** have no `aria-describedby` on either
 *   platform. They become the control's `accessibilityHint`, read after its
 *   name, in the Web's order: the error first.
 * - **Required** has no state to put it in -- React Native maps no
 *   `aria-required` -- so the hint ends with it. The asterisk stays hidden,
 *   as on the Web: it is a picture of what the hint now says.
 * - **The error is announced** when it appears, as `role="alert"` makes it on
 *   the Web, through `announceForAccessibility`.
 *
 * Only a string or a number can be read into a hint or an announcement. An
 * error or a description that is an element is still drawn, and not read.
 */

import { useHozoMessage } from '@hozo/behaviors'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useEffect, useId } from 'react'
import { AccessibilityInfo, Text, View } from 'react-native'

/** What a control needs to be part of a field, on React Native. */
export interface HozoFieldControl {
  /** The label's text, which is all iOS can be given. */
  accessibilityLabel: string | undefined
  /** The label's `nativeID`, which Android reads instead. */
  accessibilityLabelledBy: string
  /** The error, the description and whether it is required, in that order. */
  accessibilityHint: string | undefined
}

export interface HozoFieldProps {
  label: ReactNode
  /** The control's name where `label` is not a string. */
  accessibilityLabel?: string
  children: (control: HozoFieldControl) => ReactNode
  description?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  labelClassName?: string
  requiredClassName?: string
  descriptionClassName?: string
  errorClassName?: string
}

function spoken(node: ReactNode): string | undefined {
  return typeof node === 'string' || typeof node === 'number' ? String(node) : undefined
}

let warned = false

export function HozoField({
  label,
  accessibilityLabel,
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
  const message = useHozoMessage()
  const labelId = `${useId()}-label`
  const name = accessibilityLabel ?? spoken(label)
  if (name === undefined && !warned) {
    warned = true
    console.warn(
      '[hozo] Field has a label that is not a string and no `accessibilityLabel`, so its ' +
        'control has no name on iOS, which has no way to point at the label.',
    )
  }
  const errorText = spoken(error)
  // Sentences, so a reader pauses between them; a part that already ends a
  // sentence is not given a second full stop.
  const hint =
    [errorText, spoken(description), required ? message('hozo.field.required') : undefined]
      .filter((part): part is string => part !== undefined && part !== '')
      .reduce(
        (text, part) => (text ? `${text}${/[.!?。]$/.test(text) ? ' ' : '. '}${part}` : part),
        '',
      ) || undefined

  useEffect(() => {
    if (errorText) AccessibilityInfo.announceForAccessibility(errorText)
  }, [errorText])

  return (
    <View style={hozoClasses(className)}>
      <Text nativeID={labelId} style={hozoClasses(labelClassName)}>
        {label}
        {required ? (
          <Text aria-hidden style={hozoClasses(requiredClassName)}>
            {' *'}
          </Text>
        ) : null}
      </Text>
      {children({
        accessibilityLabel: name,
        accessibilityLabelledBy: labelId,
        accessibilityHint: hint,
      })}
      {error === undefined ? null : <Text style={hozoClasses(errorClassName)}>{error}</Text>}
      {description === undefined ? null : (
        <Text style={hozoClasses(descriptionClassName)}>{description}</Text>
      )}
    </View>
  )
}

export {
  HozoField as Field,
  type HozoFieldControl as FieldControl,
  type HozoFieldProps as FieldProps,
}
