import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoAuthoredStyle } from '@hozo/engine/generated/gap-styles'
import { hozoClasses } from '@hozo/engine/project'
import { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  type ColorValue,
  Modal,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import type { HozoCommand } from './command-palette.tsx'
import { currentCommand, rankCommands } from './command-rules.ts'
import { nonControlSlotFacts } from './non-control-facts.native.ts'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import { PatternScrollContainer } from './scroll-container.native.tsx'
import type { CommandInputSlotFacts, CommandPaletteSlotFacts } from './slot-facts.native.ts'
import { splitTextStyle } from './text-style.native.ts'

export type { HozoCommand }

type Style = StyleProp<ViewStyle | TextStyle>
type ItemState = InteractionState & CommandPaletteSlotFacts
type InputState = Pick<InteractionState, 'focused' | 'focusVisible'> & CommandInputSlotFacts

export interface HozoCommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  commands: readonly HozoCommand[]
  placeholder?: string
  accessibilityLabel?: string
  portal?: boolean
  /**
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as the style props below; a file it did
   * not read leaves them here as strings, resolved through the project's
   * candidate map (#886) before the matching style prop.
   */
  className?: string
  scrimClassName?: string
  panelClassName?: string
  inputClassName?: string
  listClassName?: string
  groupHeadingClassName?: string
  itemClassName?: string
  activeItemClassName?: string
  shortcutClassName?: string
  emptyClassName?: string
  style?: Style
  scrimStyle?: Style
  panelStyle?: Style
  inputStyle?: Style
  listStyle?: Style
  groupHeadingStyle?: Style
  itemStyle?: Style
  activeItemStyle?: Style
  shortcutStyle?: Style
  emptyStyle?: Style
  /** @internal Static pointer and semantic classes, evaluated by the item owner. */
  hozoItemStyle?: (state: ItemState) => Style
  /** @internal The return-key target's look, not an input-focus proxy. */
  hozoActiveItemStyle?: (state: ItemState) => Style
  /** @internal Only the real search field supplies focus and editable-input facts. */
  hozoInputStyle?: (state: InputState) => Style
  /** @internal Placeholder colour reaches the actual search field. */
  hozoInputPlaceholderTextColor?: ColorValue
  /** @internal The list already scrolls by default on Native. */
  hozoListScrollY?: boolean
  testID?: string
}

/**
 * A searchable list of commands on React Native: a full-screen modal with
 * the keyboard raised in its field and the matching commands below it, each a
 * button named for what it does, under its group's heading.
 *
 * There is no arrow-key focus to move on a phone, so `activeItemStyle` starts
 * on the first enabled match. Pointer hover chooses a different command, as
 * on the Web; the keyboard's return key runs that same target. How many match is
 * announced as the query narrows them, for the reason the Web half gives. The
 * modal closes on Android's back button and VoiceOver's escape gesture.
 */
export function HozoCommandPalette({
  open = false,
  onOpenChange,
  commands,
  placeholder,
  accessibilityLabel,
  className,
  scrimClassName,
  panelClassName,
  inputClassName,
  listClassName,
  groupHeadingClassName,
  itemClassName,
  activeItemClassName,
  shortcutClassName,
  emptyClassName,
  style,
  scrimStyle,
  panelStyle,
  inputStyle,
  listStyle,
  groupHeadingStyle,
  itemStyle,
  activeItemStyle,
  shortcutStyle,
  emptyStyle,
  hozoItemStyle,
  hozoActiveItemStyle,
  hozoInputStyle,
  hozoInputPlaceholderTextColor,
  hozoListScrollY,
  testID,
}: HozoCommandPaletteProps) {
  const message = useHozoMessage()
  const { locale } = useHozoI18n()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<number | null>(null)
  const { state: inputInteraction, handlers: inputHandlers } = usePressableInteraction({
    focusVisible: 'keyboard-input',
  })
  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(null)
      inputHandlers.blur()
    }
  }, [open, inputHandlers])

  const ranked = rankCommands(commands, query, locale)
  const groups: { name: string | undefined; members: number[] }[] = []
  for (const index of ranked) {
    const name = commands[index]?.group
    const found = groups.find((group) => group.name === name)
    if (found) found.members.push(index)
    else groups.push({ name, members: [index] })
  }
  const order = groups.flatMap((group) => group.members)
  const current = currentCommand(order, commands, active)
  const count = order.length

  // The count, as the query narrows it: the Web half's live region.
  useEffect(() => {
    if (!open || query.trim() === '') return
    AccessibilityInfo.announceForAccessibility(
      count === 0
        ? message('hozo.commandPalette.empty')
        : count === 1
          ? message('hozo.commandPalette.oneResult')
          : message('hozo.commandPalette.results', { count }),
    )
  }, [count, message, open, query])

  const close = () => onOpenChange?.(false)
  const run = (index: number | null) => {
    const command = index === null ? undefined : commands[index]
    if (!command || command.disabled) return
    close()
    command.onSelect()
  }
  const label = message('hozo.commandPalette.label', {}, accessibilityLabel)
  // Text styles written on the palette or its panel reach every label in it,
  // as they would by inheritance on the Web.
  const [rootBox, rootText] = splitTextStyle([hozoClasses(className), hozoAuthoredStyle(style)])
  const [panelBox, ownText] = splitTextStyle([
    hozoClasses(panelClassName),
    hozoAuthoredStyle(panelStyle),
  ])
  const panelText = { ...rootText, ...ownText }
  // The Web input is editable and aria-expanded while the palette is mounted.
  // Omit unmeasured pointer facts, even from a compiled residual callback.
  const inputFacts = {
    focused: inputInteraction.focused,
    focusVisible: inputInteraction.focusVisible,
    disabled: false,
    enabled: true,
    readOnly: false,
    'aria-disabled': false,
    'aria-selected': false,
    'aria-checked': false,
    'aria-expanded': true,
  } satisfies CommandInputSlotFacts

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={[FILL, rootBox]} testID={testID}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={(interaction) => [
            FILL_ABSOLUTE,
            hozoClasses(scrimClassName, { ...interaction }),
            hozoAuthoredStyle(scrimStyle),
          ]}
          onPress={close}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel={label}
          accessibilityActions={[{ name: 'escape' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') close()
          }}
          style={panelBox}
        >
          <TextInput
            onFocus={inputHandlers.focus}
            onBlur={inputHandlers.blur}
            onPointerDown={inputHandlers.pointerDown}
            onPressIn={inputHandlers.pointerDown}
            onKeyDown={inputHandlers.keyDown}
            value={query}
            onChangeText={(text) => {
              setQuery(text)
              setActive(null)
            }}
            placeholder={placeholder}
            placeholderTextColor={hozoInputPlaceholderTextColor}
            accessibilityLabel={placeholder ?? label}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="go"
            onSubmitEditing={() => run(current)}
            style={[
              panelText,
              hozoClasses(inputClassName, inputFacts),
              hozoInputStyle?.(inputFacts),
              hozoAuthoredStyle(inputStyle) as StyleProp<TextStyle>,
            ]}
          />
          <PatternScrollContainer
            enabled={hozoListScrollY ?? true}
            style={
              [hozoClasses(listClassName), hozoAuthoredStyle(listStyle)] as StyleProp<ViewStyle>
            }
          >
            {groups.map((group) => (
              <View key={group.name ?? ''}>
                {group.name !== undefined ? (
                  <Text
                    accessibilityRole="header"
                    style={[
                      panelText,
                      hozoClasses(groupHeadingClassName, nonControlSlotFacts),
                      hozoAuthoredStyle(groupHeadingStyle) as StyleProp<TextStyle>,
                    ]}
                  >
                    {group.name}
                  </Text>
                ) : null}
                {group.members.map((index) => {
                  const command = commands[index] as HozoCommand
                  const stateFor = (interaction: InteractionState) =>
                    ({
                      ...interaction,
                      // The Web input keeps focus through aria-activedescendant.
                      // A Native button can receive OS focus, but must not lend
                      // it to the option div's CSS predicates or typography.
                      focused: false,
                      focusVisible: false,
                      // CSS facts describe the Web option div, not this Native
                      // button's announcement or actual activation guard below.
                      disabled: false,
                      enabled: false,
                      'aria-disabled': Boolean(command.disabled),
                      'aria-selected': index === current,
                      'aria-checked': false,
                    }) satisfies CommandPaletteSlotFacts
                  // The active command is the return-key target, not a press.
                  // Its look reads the actual host facts. The decorative
                  // shortcut below is not a second focus owner.
                  const look = (interaction: InteractionState) => {
                    const state = stateFor(interaction)
                    return splitTextStyle([
                      hozoClasses(itemClassName, state),
                      hozoItemStyle?.(state),
                      hozoAuthoredStyle(itemStyle),
                      index === current && [
                        hozoClasses(activeItemClassName, state),
                        hozoActiveItemStyle?.(state),
                        hozoAuthoredStyle(activeItemStyle),
                      ],
                    ])
                  }
                  return (
                    <Pressable
                      key={command.id}
                      accessibilityRole="button"
                      accessibilityLabel={command.label}
                      accessibilityState={{ disabled: Boolean(command.disabled) }}
                      disabled={command.disabled}
                      onHoverIn={() => {
                        if (!command.disabled && index !== current) setActive(index)
                      }}
                      onPress={() => run(index)}
                      style={(interaction) => [ROW, look(interaction)[0]]}
                    >
                      {(interaction) => {
                        // A shortcut span owns none of the option's semantic
                        // attributes or events. Inherited typography is separate
                        // from matching a predicate on the shortcut itself.
                        const [, itemText] = look(interaction)
                        const [shortcutBox, shortcutText] = splitTextStyle([
                          hozoClasses(shortcutClassName, nonControlSlotFacts),
                          hozoAuthoredStyle(shortcutStyle),
                        ])
                        return (
                          <>
                            <Text style={[panelText, itemText]}>{command.label}</Text>
                            {command.shortcut ? (
                              <View
                                style={shortcutBox}
                                accessibilityElementsHidden
                                importantForAccessibility="no-hide-descendants"
                              >
                                <Text style={[panelText, itemText, shortcutText]}>
                                  {command.shortcut}
                                </Text>
                              </View>
                            ) : null}
                          </>
                        )
                      }}
                    </Pressable>
                  )
                })}
              </View>
            ))}
            {count === 0 ? (
              <Text
                style={[
                  panelText,
                  hozoClasses(emptyClassName, nonControlSlotFacts),
                  hozoAuthoredStyle(emptyStyle) as StyleProp<TextStyle>,
                ]}
              >
                {message('hozo.commandPalette.empty')}
              </Text>
            ) : null}
          </PatternScrollContainer>
        </View>
      </View>
    </Modal>
  )
}

const FILL: ViewStyle = { flex: 1 }
const FILL_ABSOLUTE: ViewStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }
const ROW: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
}

export {
  type HozoCommand as Command,
  HozoCommandPalette as CommandPalette,
  type HozoCommandPaletteProps as CommandPaletteProps,
}
