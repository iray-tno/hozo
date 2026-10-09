import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import type { HozoCommand } from './command-palette.tsx'
import { rankCommands } from './command-rules.ts'
import { splitTextStyle } from './text-style.native.ts'

export type { HozoCommand }

type Style = StyleProp<ViewStyle | TextStyle>

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
   * not read leaves them here, where a Native pattern has no class list to
   * resolve.
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
  testID?: string
}

/**
 * A searchable list of commands on React Native: a full-screen modal with
 * the keyboard raised in its field and the matching commands below it, each a
 * button named for what it does, under its group's heading.
 *
 * There is no arrow-key focus to move on a phone, so `activeItemStyle` marks
 * the first match -- the one the keyboard's return key runs. How many match is
 * announced as the query narrows them, for the reason the Web half gives. The
 * modal closes on Android's back button and VoiceOver's escape gesture.
 */
export function HozoCommandPalette({
  open = false,
  onOpenChange,
  commands,
  placeholder,
  accessibilityLabel,
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
  testID,
}: HozoCommandPaletteProps) {
  const message = useHozoMessage()
  const { locale } = useHozoI18n()
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const ranked = rankCommands(commands, query, locale)
  const groups: { name: string | undefined; members: number[] }[] = []
  for (const index of ranked) {
    const name = commands[index]?.group
    const found = groups.find((group) => group.name === name)
    if (found) found.members.push(index)
    else groups.push({ name, members: [index] })
  }
  const order = groups.flatMap((group) => group.members)
  const first = order.find((index) => !commands[index]?.disabled)
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
  const run = (index: number | undefined) => {
    const command = index === undefined ? undefined : commands[index]
    if (!command || command.disabled) return
    close()
    command.onSelect()
  }
  const label = message('hozo.commandPalette.label', {}, accessibilityLabel)
  // Text styles written on the palette or its panel reach every label in it,
  // as they would by inheritance on the Web.
  const [rootBox, rootText] = splitTextStyle(style)
  const [panelBox, ownText] = splitTextStyle(panelStyle)
  const panelText = { ...rootText, ...ownText }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={[FILL, rootBox]} testID={testID}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[FILL_ABSOLUTE, scrimStyle]}
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
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            accessibilityLabel={placeholder ?? label}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="go"
            onSubmitEditing={() => run(first)}
            style={[panelText, inputStyle as StyleProp<TextStyle>]}
          />
          <ScrollView keyboardShouldPersistTaps="handled" style={listStyle as StyleProp<ViewStyle>}>
            {groups.map((group) => (
              <View key={group.name ?? ''}>
                {group.name !== undefined ? (
                  <Text
                    accessibilityRole="header"
                    style={[panelText, groupHeadingStyle as StyleProp<TextStyle>]}
                  >
                    {group.name}
                  </Text>
                ) : null}
                {group.members.map((index) => {
                  const command = commands[index] as HozoCommand
                  const [box, text] = splitTextStyle([
                    itemStyle,
                    index === first && activeItemStyle,
                  ])
                  const [shortcutBox, shortcutText] = splitTextStyle(shortcutStyle)
                  return (
                    <Pressable
                      key={command.id}
                      accessibilityRole="button"
                      accessibilityLabel={command.label}
                      accessibilityState={{ disabled: Boolean(command.disabled) }}
                      disabled={command.disabled}
                      onPress={() => run(index)}
                      style={[ROW, box]}
                    >
                      <Text style={[panelText, text]}>{command.label}</Text>
                      {command.shortcut ? (
                        <View
                          style={shortcutBox}
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                        >
                          <Text style={[panelText, shortcutText]}>{command.shortcut}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            ))}
            {count === 0 ? (
              <Text style={[panelText, emptyStyle as StyleProp<TextStyle>]}>
                {message('hozo.commandPalette.empty')}
              </Text>
            ) : null}
          </ScrollView>
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
