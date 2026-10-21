// From the package root rather than `@hozo/behaviors/native`, which is the
// subset that exists because its types differ per platform. This hook's do not:
// the signature is the same on both sides and the export condition picks the
// implementation, which is what `dialog.native.tsx` relies on for
// `shouldRestoreFocus`.
import { useAnnounce, useHozoMessage } from '@hozo/behaviors'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoClasses } from '@hozo/engine/project'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { nonControlClassFacts } from './class-facts.native.ts'

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
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  /**
   * The three a `Field` hands its control. Carried here and mostly unused: React
   * Native maps a handful of `aria-*` props onto its own accessibility props and
   * these are not among them. Invalid/required still supply the field's class
   * predicates, not a claim that the Native accessibility tree exposes them.
   */
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
  autoGrow?: boolean
  minRows?: number
  maxRows?: number
  maxLength?: number
  formatCount?: (remaining: number, maxLength: number) => string
  announceRemaining?: number
  disabled?: boolean
  readOnly?: boolean
  name?: string
  id?: string
  rows?: number
  /**
   * Tailwind classes, the same props the Web half takes.
   *
   * Each list uses the project's existing candidate resolver on its real
   * owner, before explicit style. Only the editable field owns input focus.
   */
  className?: string
  fieldClassName?: string
  countClassName?: string
  style?: StyleProp<ViewStyle>
  fieldStyle?: StyleProp<TextStyle>
  countStyle?: StyleProp<TextStyle>
  testID?: string
  onBlur?: () => void
  onFocus?: () => void
}

/**
 * A multiline field that grows with what is typed into it, on React Native.
 *
 * The same arithmetic as the Web half and a different measurement:
 * `onContentSizeChange` reports the text's own height, where a Web
 * `scrollHeight` reports the text plus the padding. `text-area-rules.ts` takes
 * the content and the padding separately for exactly that reason, so neither
 * half has to subtract something the other one added.
 *
 * ## The line height comes from the resolved style
 *
 * `minRows` and `maxRows` are line counts, and nothing here can ask a view how
 * tall a line is. `StyleSheet.flatten` can, though: the style prop has already
 * been resolved by the time it arrives -- including the `StyleSheet` entry the
 * compiler lowered a `text-sm` into -- so `lineHeight`, or `fontSize * 1.2`, or a
 * constant, in that order. Which is also why the look matters more here than it
 * looks: a class list that sets no text size leaves the fallback deciding.
 *
 * ## No `numberOfLines`
 *
 * It caps the lines Android *renders* rather than the height the field takes, so
 * a field with `numberOfLines={4}` and nine lines of text silently hides five of
 * them. `maxHeight` scrolls instead, which is what a cap should do.
 */
export function HozoTextArea({
  value: controlled,
  defaultValue = '',
  onChangeText,
  placeholder,
  accessibilityLabel,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  'aria-required': required,
  autoGrow = true,
  minRows = 2,
  maxRows,
  maxLength,
  formatCount: formatCountProp,
  announceRemaining = 10,
  disabled,
  readOnly,
  className,
  fieldClassName,
  countClassName,
  style,
  fieldStyle,
  countStyle,
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
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const text = controlled ?? uncontrolled
  const [content, setContent] = useState(0)
  const { state: interaction, handlers } = usePressableInteraction({
    focusVisible: 'keyboard-input',
  })
  // A disabled textarea is not editable either; a read-only textarea can
  // still receive focus. Neither fact belongs to the wrapper or counter.
  const fieldFacts = {
    focused: !disabled && interaction.focused,
    focusVisible: !disabled && interaction.focusVisible,
    disabled: Boolean(disabled),
    enabled: !disabled,
    readOnly: Boolean(disabled || readOnly),
    'aria-invalid': Boolean(invalid),
    'aria-required': Boolean(required),
    'aria-disabled': false,
    'aria-selected': false,
    'aria-checked': false,
  }
  useEffect(() => {
    if (disabled) handlers.blur()
  }, [disabled, handlers])

  const remaining = remainingCharacters(text, maxLength)
  const announced = useRef<number | null>(null)
  const announce = useAnnounce()

  // Growth uses the same class + explicit style that the field draws, not
  // only its inline override. Resolve once, then share the flattened result.
  const resolvedField =
    StyleSheet.flatten([
      hozoClasses(fieldClassName, fieldFacts) as StyleProp<TextStyle>,
      fieldStyle,
    ]) ?? {}
  const lineHeight = usableLineHeight(resolvedField.lineHeight, resolvedField.fontSize)
  const top =
    resolvedField.paddingTop ?? resolvedField.paddingVertical ?? resolvedField.padding ?? 0
  const bottom =
    resolvedField.paddingBottom ?? resolvedField.paddingVertical ?? resolvedField.padding ?? 0
  const padding = typeof top === 'number' && typeof bottom === 'number' ? top + bottom : 0

  const size = clampedSize({ content, lineHeight, extra: padding, minRows, maxRows })

  useEffect(() => {
    const speak = shouldAnnounceCount({
      previous: announced.current,
      remaining,
      threshold: announceRemaining,
    })
    announced.current = remaining
    if (speak && remaining !== null && maxLength !== undefined) {
      announce(formatCount(remaining, maxLength))
    }
  }, [announce, announceRemaining, formatCount, maxLength, remaining])

  return (
    <View style={[hozoClasses(className, nonControlClassFacts), style]}>
      <TextInput
        multiline
        value={text}
        placeholder={placeholder}
        maxLength={maxLength}
        editable={!disabled && !readOnly}
        accessibilityLabel={accessibilityLabel}
        // The Web half can point at an element by id; here the description is
        // carried as a hint, which is the only channel this platform has for
        // "extra text about this field" and is what the counter below becomes.
        accessibilityHint={
          remaining !== null && maxLength !== undefined
            ? formatCount(remaining, maxLength)
            : describedBy
        }
        accessibilityState={{ disabled: Boolean(disabled) }}
        testID={testID}
        onContentSizeChange={(event) => {
          if (autoGrow) setContent(event.nativeEvent.contentSize.height)
        }}
        onChangeText={(next) => {
          if (controlled === undefined) setUncontrolled(next)
          onChangeText?.(next)
        }}
        onBlur={() => {
          handlers.blur()
          onBlur?.()
        }}
        onFocus={() => {
          if (!disabled) handlers.focus()
          onFocus?.()
        }}
        // `textAlignVertical` so Android starts the text at the top rather than
        // centring one line in a four-line box, which is the difference between
        // a textarea and a very tall single-line field.
        style={[
          resolvedField,
          { textAlignVertical: 'top' },
          autoGrow ? { height: size.height } : null,
        ]}
      />
      {remaining !== null && maxLength !== undefined ? (
        // Hidden from the accessibility tree, because the same words are already
        // the field's hint. On the Web the counter *is* the description, through
        // `aria-describedby`; here there is no id to point at, so the text is
        // duplicated and the visible copy is the one that steps aside.
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[hozoClasses(countClassName, nonControlClassFacts), countStyle]}
        >
          {formatCount(remaining, maxLength)}
        </Text>
      ) : null}
    </View>
  )
}

export { HozoTextArea as TextArea, type HozoTextAreaProps as TextAreaProps }
