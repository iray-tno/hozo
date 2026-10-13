import { hozoTextChildren, useHozoMessage } from '@hozo/behaviors'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import { type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import { useChipRowInteraction } from './chip-row-interaction.native.ts'
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
   * Static interaction classes use the private slot callback below instead
   * of a candidate lookup; both paths feed the same owner and text split.
   */
  className?: string
  removeClassName?: string
  style?: StyleProp<ViewStyle | TextStyle>
  removeStyle?: StyleProp<ViewStyle | TextStyle>
  /** @internal Static class styles, evaluated with this slot's real state. */
  hozoStyle?: (state: InteractionState) => StyleProp<ViewStyle | TextStyle>
  /** @internal The remove button never borrows its ancestor's focus. */
  hozoRemoveStyle?: (state: InteractionState) => StyleProp<ViewStyle | TextStyle>
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
  hozoStyle,
  hozoRemoveStyle,
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
      hozoStyle?.(interaction),
      style,
    ])
  const removeLook = (interaction: InteractionState) =>
    split([
      hozoClasses(removeClassName, {
        ...interaction,
        disabled: Boolean(disabled),
        'aria-disabled': Boolean(disabled),
      }),
      hozoRemoveStyle?.(interaction),
      removeStyle,
    ])
  const name = accessibilityLabel ?? (typeof children === 'string' ? children : undefined)
  const remove = (events?: ReturnType<typeof useChipRowInteraction>['events']['remove']) =>
    onRemove ? (
      <Pressable
        {...events}
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

  const body = (row?: ReturnType<typeof useChipRowInteraction>) =>
    selectable ? (
      <Pressable
        {...row?.events.toggle}
        accessibilityRole="togglebutton"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
        disabled={disabled}
        style={(interaction) => (onRemove ? undefined : look(interaction)[0])}
        testID={onRemove ? undefined : testID}
        onPress={toggle}
      >
        {/* Both controls can activate/hover the ancestor, never focus it. */}
        {(interaction) => label(children, look(row?.state ?? interaction)[1])}
      </Pressable>
    ) : (
      <Text style={look(row?.state ?? IDLE)[1]}>{children}</Text>
    )

  if (!onRemove && selectable) return body()
  return (
    <ChipRow selectable={selectable} disabled={disabled}>
      {(row) => (
        <View
          {...row.events.row}
          style={[{ flexDirection: 'row', alignItems: 'center' }, look(row.state)[0]]}
          testID={testID}
        >
          {body(row)}
          {remove(row.events.remove)}
        </View>
      )}
    </ChipRow>
  )
}

// Allocate ancestor tracking only for an actual row, not standalone toggles.
function ChipRow({
  selectable,
  disabled,
  children,
}: {
  selectable: boolean
  disabled?: boolean
  children: (row: ReturnType<typeof useChipRowInteraction>) => ReactNode
}) {
  return children(useChipRowInteraction(selectable, disabled))
}

const IDLE: InteractionState = {
  pressed: false,
  hovered: false,
  focused: false,
  focusVisible: false,
}

export { HozoChip as Chip, type HozoChipProps as ChipProps }
