import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { Keyboard, type StyleProp, View, type ViewStyle } from 'react-native'

export interface HozoFormProps {
  onSubmit?: () => void
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  /**
   * Accepted and unused here, which is a platform difference rather than an
   * omission.
   *
   * The Web half finds the first control marked `aria-invalid` and focuses it.
   * React Native has neither half of that: `aria-invalid` is not one of the
   * `aria-*` props it maps, so nothing is marked, and nothing in the framework can
   * move accessibility focus to a view -- which is [#491]'s whole subject, the
   * first capability a native module would be for.
   *
   * [#491]: https://github.com/iray-tno/hozo/issues/491
   */
  focusInvalidOnSubmit?: boolean
  /**
   * Tailwind classes, the same prop the Web half takes.
   *
   * On a tag the compiler lowers it is gone by runtime, replaced by a
   * `StyleSheet` entry. Anywhere else it is carried and ignored here -- this side
   * has no CSS engine to resolve a class list against -- and the type still has to
   * accept it, because an app is type-checked against the source the compiler
   * reads rather than its output.
   */
  className?: string
  style?: StyleProp<ViewStyle>
  testID?: string
  children?: ReactNode
}

interface FormContextValue {
  submit: () => void
}

const FormContext = createContext<FormContextValue | null>(null)

/**
 * The submit the enclosing `Form` owns.
 *
 * This matters more here than on the Web, where a form submits itself when a
 * button inside it is pressed. There is no form element on this platform and no
 * Enter key, so the submit button's `onPress` and the last field's
 * `onSubmitEditing` both have to be handed something -- and this is the something,
 * written once in an application that compiles for both.
 */
export function useFormSubmit(): () => void {
  const context = useContext(FormContext)
  return useMemo(() => context?.submit ?? (() => {}), [context])
}

/**
 * A form, on a platform that has no form element.
 *
 * What survives the crossing is the contract rather than the element: `onSubmit`,
 * and a `useFormSubmit` that anything inside can call. What does not survive is
 * the element's own behaviour -- a press on a button does not submit, Enter does
 * not exist, and there is no `role="form"` landmark in React Native's vocabulary
 * to give the group a name a screen reader announces as a form. The label is
 * carried on the `View` so the group has a name at all.
 *
 * ## Dismissing the keyboard is the one thing this half adds
 *
 * #143 asks for a "keyboard-dismissing view wrapper", and the reason is concrete:
 * the keyboard covers the bottom half of the screen, which on a phone is where the
 * submit button and any error that appears under the last field both are. So a
 * submission closes it first. On the Web nothing is covering anything and there is
 * nothing to do.
 */
export function HozoForm({ onSubmit, accessibilityLabel, style, testID, children }: HozoFormProps) {
  const context = useMemo<FormContextValue>(
    () => ({
      submit: () => {
        // First, so that whatever `onSubmit` reveals is not behind the keyboard.
        Keyboard.dismiss()
        onSubmit?.()
      },
    }),
    [onSubmit],
  )

  return (
    <FormContext.Provider value={context}>
      <View accessibilityLabel={accessibilityLabel} style={style} testID={testID}>
        {children}
      </View>
    </FormContext.Provider>
  )
}

export { HozoForm as Form, type HozoFormProps as FormProps }
