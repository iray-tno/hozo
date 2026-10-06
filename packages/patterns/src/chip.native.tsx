import { hozoTextChildren, useHozoMessage } from '@hozo/behaviors'
import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native'

export interface HozoChipProps {
  children?: ReactNode
  accessibilityLabel?: string
  selected?: boolean
  defaultSelected?: boolean
  onSelectedChange?: (selected: boolean) => void
  onRemove?: () => void
  removeLabel?: string
  removeIcon?: ReactNode
  disabled?: boolean
  /**
   * Tailwind classes, the same props the Web half takes. Carried and ignored
   * here -- a Native pattern has no class list to resolve -- and accepted so
   * the source type-checks; see `popover.native.tsx`.
   */
  className?: string
  removeClassName?: string
  style?: StyleProp<ViewStyle>
  removeStyle?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * A compact token on React Native: a `togglebutton` with `checked` when it
 * is selectable -- Android's `ToggleButton`, and the counterpart of the Web
 * half's `aria-pressed` -- and a separate remove button when it is
 * removable, for the reason the Web half gives.
 */
export function HozoChip({
  children,
  accessibilityLabel,
  selected,
  defaultSelected,
  onSelectedChange,
  onRemove,
  removeLabel,
  removeIcon = '×',
  disabled,
  style,
  removeStyle,
  testID,
}: HozoChipProps) {
  const message = useHozoMessage()
  const selectable =
    selected !== undefined || defaultSelected !== undefined || onSelectedChange !== undefined
  const [uncontrolled, setUncontrolled] = useState(defaultSelected ?? false)
  const on = selected ?? uncontrolled
  const toggle = useCallback(() => {
    const next = !on
    if (selected === undefined) setUncontrolled(next)
    onSelectedChange?.(next)
  }, [on, onSelectedChange, selected])

  const label = accessibilityLabel ?? (typeof children === 'string' ? children : undefined)
  const remove = onRemove ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={message('hozo.chip.remove', { label: label ?? '' }, removeLabel)}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={removeStyle}
      onPress={onRemove}
    >
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {removeIcon}
      </Text>
    </Pressable>
  ) : null

  const body = selectable ? (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={remove ? undefined : style}
      testID={remove ? undefined : testID}
      onPress={toggle}
    >
      {hozoTextChildren(children)}
    </Pressable>
  ) : (
    <Text>{children}</Text>
  )

  if (!remove && selectable) return body
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]} testID={testID}>
      {body}
      {remove}
    </View>
  )
}

export { HozoChip as Chip, type HozoChipProps as ChipProps }
