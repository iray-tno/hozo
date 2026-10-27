import { hozoTextChildren } from '@hozo/behaviors'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoClasses } from '@hozo/engine/project'
import { type ReactNode, useCallback, useState } from 'react'
import {
  type ColorValue,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { activeAfter, filterOptions } from './combobox-rules.ts'
import { nonControlSlotFacts } from './non-control-facts.native.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { PatternScrollContainer } from './scroll-container.native.tsx'
import type { ComboboxInputSlotFacts, ListOptionSlotFacts } from './slot-facts.native.ts'
import { splitTextStyle } from './text-style.native.ts'

type Style = StyleProp<ViewStyle | TextStyle>
type InputState = Pick<InteractionState, 'focused' | 'focusVisible'> & ComboboxInputSlotFacts
type OptionState = Pick<InteractionState, 'hovered' | 'pressed'> & ListOptionSlotFacts

export interface HozoComboboxOption<T> {
  value: T
  label: string
  render?: ReactNode
  disabled?: boolean
}

export interface HozoComboboxProps<T> {
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Here it arrives as a string and is resolved through
   * the project's candidate map (#886), with the state of the element it
   * styles. Each `*Style` prop comes after its class list.
   */
  className?: string
  /** Class lists for the parts, resolved like `className`. */
  inputClassName?: string
  listClassName?: string
  optionClassName?: string
  options: readonly HozoComboboxOption<T>[]
  value?: T
  onValueChange?: (value: T) => void
  match?: 'starts' | 'contains'
  accessibilityLabel?: string
  placeholder?: string
  /**
   * The list open on mount, nothing active, as `Menu`'s and `Popover`'s
   * can be. For an audit that has to read the listbox rather than the field.
   */
  defaultOpen?: boolean
  /** Application validation state belongs to the editable field. */
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling'
  style?: Style
  inputStyle?: Style
  listStyle?: Style
  optionStyle?: Style
  /** @internal The editable field owns focus and expanded state. */
  hozoInputStyle?: (state: InputState) => Style
  /** @internal Placeholder colour is a field prop, never a TextStyle. */
  hozoInputPlaceholderTextColor?: ColorValue
  /** @internal Popup overflow belongs to its own real scroll host. */
  hozoListScrollY?: boolean
  /** @internal Options own pointer/active facts, never the input's focus. */
  hozoOptionStyle?: (state: OptionState) => Style
  emptyMessage?: ReactNode
}

export function HozoCombobox<T>({
  className,
  inputClassName,
  listClassName,
  optionClassName,
  options,
  value,
  onValueChange,
  match = 'starts',
  accessibilityLabel,
  placeholder,
  defaultOpen = false,
  'aria-invalid': invalid,
  style,
  inputStyle,
  listStyle,
  optionStyle,
  hozoInputStyle,
  hozoInputPlaceholderTextColor,
  hozoListScrollY,
  hozoOptionStyle,
  emptyMessage,
}: HozoComboboxProps<T>) {
  const chosen = options.find((option) => option.value === value)
  const [query, setQuery] = useState(chosen?.label ?? '')
  const [open, setOpen] = useState(defaultOpen)
  const [active, setActive] = useState<number | null>(null)
  const { state: inputInteraction, handlers: inputHandlers } = usePressableInteraction({
    focusVisible: 'keyboard-input',
  })

  const visible = filterOptions({ query, labels: options.map((option) => option.label), match })

  const close = useCallback(() => {
    setOpen(false)
    setActive(null)
  }, [])

  const commit = useCallback(
    (index: number) => {
      const option = options[index]
      if (!option || option.disabled) return
      setQuery(option.label)
      onValueChange?.(option.value)
      close()
    },
    [close, onValueChange, options],
  )

  const [rootBox, rootText] = splitTextStyle([hozoClasses(className, nonControlSlotFacts), style])
  const [listBox, listText] = open
    ? splitTextStyle([hozoClasses(listClassName, nonControlSlotFacts), listStyle])
    : []
  const inputFacts = {
    focused: inputInteraction.focused,
    focusVisible: inputInteraction.focusVisible,
    disabled: false,
    enabled: true,
    readOnly: false,
    'aria-disabled': false,
    'aria-selected': false,
    'aria-checked': false,
    'aria-expanded': open,
    'aria-invalid': String(invalid) === 'true',
  } satisfies ComboboxInputSlotFacts

  return (
    <View style={rootBox}>
      <TextInput
        style={[
          rootText,
          hozoClasses(inputClassName, inputFacts),
          hozoInputStyle?.(inputFacts),
          inputStyle as StyleProp<TextStyle>,
        ]}
        accessibilityRole="combobox"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        placeholder={placeholder}
        placeholderTextColor={hozoInputPlaceholderTextColor}
        value={query}
        onChangeText={(text: string) => {
          setQuery(text)
          setOpen(true)
          setActive(null)
        }}
        onFocus={inputHandlers.focus}
        onBlur={() => {
          inputHandlers.blur()
          close()
        }}
        onPointerDown={inputHandlers.pointerDown}
        onPressIn={inputHandlers.pointerDown}
        onKeyDown={inputHandlers.keyDown}
        onKeyPress={({ nativeEvent: { key } }) => {
          inputHandlers.keyDown()
          // Reuse the Web active-index rule. Delivery of a hardware arrow key
          // is platform-owned; a committed value is not a highlighted option.
          if (key === 'ArrowDown' || key === 'ArrowUp') {
            setOpen(true)
            setActive(activeAfter(key, open ? active : null, visible.length))
          } else if (key === 'Enter' && open && active !== null) {
            commit(visible[active] ?? -1)
          } else if (key === 'Escape') {
            if (open) close()
            else setQuery('')
          }
        }}
      />
      {open ? (
        <PatternScrollContainer
          enabled={hozoListScrollY}
          accessibilityRole="list"
          accessibilityLabel={accessibilityLabel}
          style={listBox}
        >
          {visible.length === 0
            ? hozoTextChildren(emptyMessage, listText)
            : visible.map((index, at) => {
                const option = options[index]
                if (!option) return null
                // A Native menuitem announces disabled, but its Web div does
                // not become :disabled/:enabled or own DOM focus as a result.
                const look = (interaction: InteractionState) => {
                  const facts = {
                    hovered: interaction.hovered,
                    pressed: interaction.pressed,
                    ...nonControlSlotFacts,
                    'aria-selected': at === active,
                    'aria-disabled': Boolean(option.disabled),
                  } satisfies OptionState
                  return splitTextStyle([
                    rootText,
                    listText,
                    hozoClasses(optionClassName, facts),
                    hozoOptionStyle?.(facts),
                    optionStyle,
                  ])
                }
                const content = option.render ?? option.label
                return (
                  <Pressable
                    key={`option-${index}`}
                    accessibilityRole="menuitem"
                    accessibilityState={{
                      selected: at === active,
                      disabled: option.disabled,
                    }}
                    disabled={option.disabled}
                    style={(interaction) => look(interaction)[0]}
                    onPress={() => commit(index)}
                  >
                    {(interaction) =>
                      typeof content === 'string' ? (
                        <Text style={look(interaction)[1]}>{content}</Text>
                      ) : (
                        content
                      )
                    }
                  </Pressable>
                )
              })}
        </PatternScrollContainer>
      ) : null}
    </View>
  )
}

export {
  HozoCombobox as Combobox,
  type HozoComboboxOption as ComboboxOption,
  type HozoComboboxProps as ComboboxProps,
}
