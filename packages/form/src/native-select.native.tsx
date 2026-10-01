import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

export interface HozoNativeSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface HozoNativeSelectProps {
  options: readonly HozoNativeSelectOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
  disabled?: boolean
  name?: string
  id?: string
  /**
   * Tailwind classes, the same props the Web half takes.
   *
   * On a tag the compiler lowers they are gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else they are carried and ignored here -- this
   * side has no CSS engine to resolve a class list against -- and the types still
   * have to accept them, because an app is type-checked against the source the
   * compiler reads rather than its output.
   */
  className?: string
  sheetClassName?: string
  scrimClassName?: string
  optionClassName?: string
  /**
   * What the fallback's dismiss says, and what iOS puts on its cancel button.
   *
   * A prop because Hozo owns no message catalogue
   * ([#157](https://github.com/iray-tno/hozo/issues/157)), and "Cancel" is
   * English. The same reason `Calendar` asks for `todayLabel`.
   */
  cancelLabel?: string
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  sheetStyle?: StyleProp<ViewStyle>
  scrimStyle?: StyleProp<ViewStyle>
  optionStyle?: StyleProp<ViewStyle>
  testID?: string
  onBlur?: () => void
  onFocus?: () => void
}

export interface NativeSelectRequest {
  options: readonly HozoNativeSelectOption[]
  value?: string
  accessibilityLabel?: string
  cancelLabel: string
  onSelect: (value: string) => void
  onCancel: () => void
}

export interface NativeSelectPresenter {
  present: (request: NativeSelectRequest) => void
}

const PresenterContext = createContext<NativeSelectPresenter | null>(null)

/**
 * Where a real platform picker gets plugged in.
 *
 * Hozo does not ship one, and this is the seam rather than a refusal (#353). The
 * reason is the dependency rather than the difficulty: React Native's core has no
 * picker any more, so a genuine Android spinner means a native module, and an
 * optional dependency on native code is precisely what `@hozo/form`'s README
 * gives as a reason for this package existing separately. An application that has
 * already installed one wraps its tree in this and gets it everywhere.
 *
 * ```tsx
 * <NativeSelectProvider presenter={myPickerPresenter}>
 * ```
 */
export function NativeSelectProvider({
  presenter,
  children,
}: {
  presenter: NativeSelectPresenter | null
  children?: ReactNode
}) {
  return <PresenterContext.Provider value={presenter}>{children}</PresenterContext.Provider>
}

export function useNativeSelectPresenter(): NativeSelectPresenter | null {
  return useContext(PresenterContext)
}

/**
 * A select that hands the choosing to the platform, on React Native.
 *
 * Three implementations behind one trigger, in this order:
 *
 * 1. **A presenter, if one was provided.** An application that has installed a
 *    real picker module says so once, through `NativeSelectProvider`, and this
 *    component stops having an opinion.
 * 2. **`ActionSheetIOS` on iOS.** The operating system draws it, it is in React
 *    Native's core, and it costs no dependency. It is the platform's own answer to
 *    "choose one of these", which is what this component is for.
 * 3. **A modal list, everywhere else.** Android has no core equivalent --
 *    `Picker` was removed from React Native years ago -- so this one is ours, and
 *    it is honest about being ours.
 *
 * That asymmetry is the implementation of "use the platform's default where there
 * is one", rather than a gap. It is written down here because it is the first
 * thing somebody will want to know and the last thing a type signature says.
 *
 * ## The fallback list is written out rather than reused, and that is a type problem
 *
 * `@hozo/patterns` has a `BottomSheet` and a `Listbox` that would have been this,
 * and reusing them is the better code. It does not typecheck: that package has no
 * `./native` entry -- `@hozo/behaviors` has one precisely so a `.native.tsx` can
 * reach the native types -- so an import here resolves to the Web half and the
 * native-only `style` props cannot be passed at all. A package that ships no CSS
 * needs those props to be reachable, so the choice was a hand-written list or
 * adding an export map entry to a published package in a PR about a select.
 *
 * The roles are copied from `listbox.native.tsx` deliberately and not invented:
 * `accessibilityRole="list"` on the container, `"menuitem"` on each row, and
 * `accessibilityState.selected` for the current one. A `./native` entry on
 * `@hozo/patterns` would let this file delete most of itself.
 *
 * ## `combobox`, not `button`
 *
 * The trigger is `accessibilityRole="combobox"`, which is what a `<select>` is in
 * an accessibility tree: a control whose value is one of a list. A button would
 * announce the current value as its *name*, so a reader would hear "Express,
 * tomorrow, button" with nothing saying what the field is.
 */
export function HozoNativeSelect({
  options,
  value: controlled,
  defaultValue = '',
  onValueChange,
  placeholder,
  accessibilityLabel,
  disabled,
  cancelLabel = 'Cancel',
  sheetStyle,
  scrimStyle,
  optionStyle,
  style,
  textStyle,
  testID,
  onBlur,
  onFocus,
}: HozoNativeSelectProps) {
  const presenter = useNativeSelectPresenter()
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const current = controlled ?? uncontrolled

  const chosen = options.find((option) => option.value === current)
  const shown = chosen?.label ?? placeholder ?? ''

  const choosable = useMemo(() => options.filter((option) => !option.disabled), [options])

  const select = (next: string) => {
    if (controlled === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }

  const openPicker = () => {
    if (disabled) return
    if (presenter) {
      presenter.present({
        options,
        value: current,
        accessibilityLabel,
        cancelLabel,
        onSelect: select,
        onCancel: () => {},
      })
      return
    }
    if (Platform.OS === 'ios') {
      // The cancel button is last, which is where iOS puts it and where people
      // reach for it. Disabled options are left out rather than greyed: an action
      // sheet has no disabled state that a screen reader reports, so an
      // unselectable row would be a row that silently does nothing.
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: accessibilityLabel,
          options: [...choosable.map((option) => option.label), cancelLabel],
          cancelButtonIndex: choosable.length,
        },
        (index) => {
          const option = choosable[index]
          if (option) select(option.value)
        },
      )
      return
    }
    setOpen(true)
  }

  return (
    <>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={accessibilityLabel}
        // The value through `accessibilityValue` rather than the label, so the
        // field keeps its name. See the component comment.
        accessibilityValue={{ text: shown }}
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        disabled={disabled}
        testID={testID}
        style={style}
        onPress={openPicker}
        onBlur={onBlur}
        onFocus={onFocus}
      >
        <Text style={textStyle}>{shown}</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        // Android's back button, which is this platform's dismiss and the thing a
        // `Modal` answers for free.
        onRequestClose={() => setOpen(false)}
      >
        {/*
          The scrim is the tap that dismisses, and it is hidden from the
          accessibility tree because `accessibilityViewIsModal` below has already
          said the screen behind is unavailable.
        */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={scrimStyle}
          onPress={() => setOpen(false)}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="none"
          accessibilityLabel={accessibilityLabel}
          // VoiceOver's two-finger scrub and TalkBack's back gesture both arrive
          // as this, which is the dismissal for somebody who cannot reach the
          // scrim.
          accessibilityActions={[{ name: 'escape' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'escape') setOpen(false)
          }}
          style={sheetStyle}
        >
          <ScrollView accessibilityRole="list" accessibilityLabel={accessibilityLabel}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="menuitem"
                accessibilityState={{
                  selected: option.value === current,
                  disabled: option.disabled,
                }}
                disabled={option.disabled}
                style={optionStyle}
                onPress={() => {
                  select(option.value)
                  // Closed on choosing. A list that stayed open after a
                  // single-select choice is a list whose dismiss is a second thing
                  // to find, and the choice is already made.
                  setOpen(false)
                }}
              >
                <Text style={textStyle}>{option.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}

export {
  HozoNativeSelect as NativeSelect,
  type HozoNativeSelectOption as NativeSelectOption,
  type HozoNativeSelectProps as NativeSelectProps,
}
