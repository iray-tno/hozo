import { hozoTextChildren, useHozoMessage } from '@hozo/behaviors'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { splitTextStyle as split } from './text-style.native.ts'

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
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as `style` and `removeStyle` (#787); a
   * file the compiler did not read leaves them here as strings, resolved
   * through the project's candidate map (#886) -- the toggle with its
   * interaction, `aria-checked` and `disabled` state -- before `style`.
   */
  className?: string
  removeClassName?: string
  style?: StyleProp<ViewStyle | TextStyle>
  removeStyle?: StyleProp<ViewStyle | TextStyle>
  testID?: string
}

function label(children: ReactNode, style: TextStyle) {
  if (Object.keys(style).length === 0) return hozoTextChildren(children)
  return typeof children === 'string' || typeof children === 'number' ? (
    <Text style={style}>{children}</Text>
  ) : (
    children
  )
}

/**
 * A compact token on React Native: a `togglebutton` with `checked` when it
 * is selectable -- Android's `ToggleButton`, and the counterpart of the Web
 * half's `aria-pressed` -- and a separate remove button when it is
 * removable, for the reason the Web half gives.
 *
 * `style` lands where the Web half puts `className`: on the toggle when the
 * chip is only a toggle, and on the row holding both controls otherwise.
 * `removeStyle` is the remove button's, as `removeClassName` is.
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
  className,
  removeClassName,
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

  const look = (interaction: InteractionState) =>
    split([
      hozoClasses(className, {
        ...interaction,
        disabled: Boolean(disabled),
        'aria-checked': on,
        'aria-disabled': Boolean(disabled),
      }),
      style,
    ])
  const removeLook = (interaction: InteractionState) =>
    split([
      hozoClasses(removeClassName, {
        ...interaction,
        disabled: Boolean(disabled),
        'aria-disabled': Boolean(disabled),
      }),
      removeStyle,
    ])
  const [box, text] = look(IDLE)
  const name = accessibilityLabel ?? (typeof children === 'string' ? children : undefined)
  const remove = onRemove ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={message('hozo.chip.remove', { label: name ?? '' }, removeLabel)}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={(interaction) => removeLook(interaction)[0]}
      onPress={onRemove}
    >
      {(interaction) => (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={removeLook(interaction)[1]}
        >
          {removeIcon}
        </Text>
      )}
    </Pressable>
  ) : null

  const body = selectable ? (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={(interaction) => (remove ? undefined : look(interaction)[0])}
      testID={remove ? undefined : testID}
      onPress={toggle}
    >
      {/* A child can hover/activate its ancestor row, but cannot focus it.
          Preserve that inherited text without inventing a focusable row. */}
      {(interaction) =>
        label(
          children,
          look(remove ? { ...interaction, focused: false, focusVisible: false } : interaction)[1],
        )
      }
    </Pressable>
  ) : (
    <Text style={text}>{children}</Text>
  )

  if (!remove && selectable) return body
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, box]} testID={testID}>
      {body}
      {remove}
    </View>
  )
}

const IDLE: InteractionState = {
  pressed: false,
  hovered: false,
  focused: false,
  focusVisible: false,
}

export { HozoChip as Chip, type HozoChipProps as ChipProps }
