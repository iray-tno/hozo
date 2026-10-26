import { useHozoMessage } from '@hozo/behaviors'
import { usePressableInteraction } from '@hozo/behaviors/pressable-interaction'
import { hozoSplitTextStyle } from '@hozo/engine'
import { hozoClasses } from '@hozo/engine/project'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { nonControlClassFacts } from './class-facts.native.ts'

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
   * The closed control's classes use the project candidate resolver, with
   * that control's own events/form facts. Text properties reach its value
   * label; explicit Native styles follow classes.
   */
  className?: string
  /**
   * A decorative node after the value, for a chevron that says the field opens
   * a list. The Web `<select>` draws its own, so this is the Native field's
   * only one (#1205); it is hidden from assistive technology, which already
   * hears a combobox.
   */
  indicatorClassName?: string
  /** Native-owned fallback chrome only; neither the system picker nor the Web select uses these. */
  sheetClassName?: string
  scrimClassName?: string
  /** Native fallback rows receive their own press/disabled/selected facts. */
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

// The value and its chevron side by side, the value taking the room and
// shrinking first, as the Web `<select>` lays out its own arrow.
const WITH_INDICATOR: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 8 }
const VALUE: TextStyle = { flexGrow: 1, flexShrink: 1 }

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
  'aria-invalid': invalid,
  'aria-required': required,
  disabled,
  className,
  indicatorClassName,
  sheetClassName,
  scrimClassName,
  optionClassName,
  cancelLabel: cancelLabelProp,
  sheetStyle,
  scrimStyle,
  optionStyle,
  style,
  textStyle,
  testID,
  onBlur,
  onFocus,
}: HozoNativeSelectProps) {
  // A string from the prop, then the project's i18n, then English;
  // `locale` the same way (decision 008).
  const message = useHozoMessage()
  const cancelLabel = message('hozo.nativeSelect.cancel', {}, cancelLabelProp)
  const presenter = useNativeSelectPresenter()
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const { state: interaction, handlers } = usePressableInteraction({ focusVisible: true })
  useEffect(() => {
    if (disabled) {
      handlers.blur()
      handlers.pressOut()
    }
  }, [disabled, handlers])
  // A select is :read-only even when enabled: it is not an editable text
  // field. Its implicit popup state is not an authored aria-expanded
  // attribute on the Web select, so do not borrow Native's expanded state.
  const facts = {
    hovered: interaction.hovered,
    pressed: !disabled && interaction.pressed,
    focused: !disabled && interaction.focused,
    focusVisible: !disabled && interaction.focusVisible,
    disabled: Boolean(disabled),
    enabled: !disabled,
    readOnly: true,
    'aria-invalid': Boolean(invalid),
    'aria-required': Boolean(required),
    'aria-disabled': false,
    'aria-expanded': false,
    'aria-selected': false,
    'aria-checked': false,
  }
  const [controlBox, controlText] = hozoSplitTextStyle(
    StyleSheet.flatten([hozoClasses(className, facts), style]) ?? {},
  )
  const current = controlled ?? uncontrolled

  const chosen = options.find((option) => option.value === current)
  const shown = chosen?.label ?? placeholder ?? ''
  // System/presenter paths have no Hozo popup owner. Do not even resolve
  // their unused class lists (or emit state warnings for absent chrome).
  const sheet = open
    ? hozoSplitTextStyle(
        StyleSheet.flatten([hozoClasses(sheetClassName, nonControlClassFacts), sheetStyle]) ?? {},
      )
    : null
  // The fallback's Native-only rows expose the same disabled/selected
  // facts they announce, not the trigger's state or a Web option attribute.
  // RN supplies press snapshots. Omit unmeasured focus/hover facts.
  const optionLook = (option: HozoNativeSelectOption, pressed: boolean) =>
    hozoSplitTextStyle(
      StyleSheet.flatten([
        hozoClasses(optionClassName, {
          pressed: !option.disabled && pressed,
          disabled: Boolean(option.disabled),
          enabled: !option.disabled,
          readOnly: true,
          'aria-selected': option.value === current,
          'aria-disabled': Boolean(option.disabled),
          'aria-checked': false,
        }),
        optionStyle,
      ]) ?? {},
    )

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
        style={
          indicatorClassName ? [WITH_INDICATOR, controlBox as ViewStyle] : (controlBox as ViewStyle)
        }
        onPress={openPicker}
        onHoverIn={handlers.hoverIn}
        onHoverOut={handlers.hoverOut}
        onPressIn={() => {
          if (!disabled) handlers.pressIn()
        }}
        onPressOut={handlers.pressOut}
        onPointerDown={handlers.pointerDown}
        onKeyDown={handlers.keyDown}
        onBlur={() => {
          handlers.blur()
          onBlur?.()
        }}
        onFocus={() => {
          if (!disabled) handlers.focus()
          onFocus?.()
        }}
      >
        <Text style={[indicatorClassName ? VALUE : null, controlText as TextStyle, textStyle]}>
          {shown}
        </Text>
        {indicatorClassName ? (
          <View
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={hozoClasses(indicatorClassName, facts)}
          />
        ) : null}
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
          style={[open && hozoClasses(scrimClassName, nonControlClassFacts), scrimStyle]}
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
          style={sheet?.[0] as ViewStyle}
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
                style={({ pressed }) => optionLook(option, pressed)[0] as ViewStyle}
                onPress={() => {
                  select(option.value)
                  // Closed on choosing. A list that stayed open after a
                  // single-select choice is a list whose dismiss is a second thing
                  // to find, and the choice is already made.
                  setOpen(false)
                }}
              >
                {({ pressed }) => (
                  <Text
                    style={[
                      sheet?.[1] as TextStyle,
                      optionLook(option, pressed)[1] as TextStyle,
                      textStyle,
                    ]}
                  >
                    {option.label}
                  </Text>
                )}
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
