import { createContext, type ReactNode, useContext, useState } from 'react'

export interface HozoNativeSelectOption {
  /**
   * The value, which is a string and not a generic.
   *
   * `Listbox` and `RadioGroup` are generic over their value and key the options
   * themselves. This cannot be: a `<select>`'s value is a string in the DOM, and
   * supporting objects would mean inventing an index or a key to map back from --
   * at which point the Web half has stopped being a plain `<select>`, which is
   * the entire reason this component exists. A caller with objects wants
   * `Listbox`.
   */
  value: string
  /**
   * The label, which is a string for the same kind of reason: an `<option>` can
   * hold text and nothing else. A `ReactNode` here would typecheck and then
   * render `[object Object]` on one platform.
   */
  label: string
  disabled?: boolean
}

export interface HozoNativeSelectProps {
  options: readonly HozoNativeSelectOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /**
   * The text shown when nothing is chosen, as an empty-valued option.
   *
   * Not disabled, and not hidden. A placeholder that cannot be chosen again is a
   * field that cannot be cleared, and whether empty is allowed is
   * `aria-required`'s question and the application's -- not something a
   * placeholder should decide by being unreachable.
   */
  placeholder?: string
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  /** The three a `Field` hands its control, spelled the way it spells them. */
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
  disabled?: boolean
  name?: string
  id?: string
  className?: string
  /**
   * The sheet the Native half falls back to, carried and unused here.
   *
   * There is no sheet on the Web, because a `<select>` already opens the
   * operating system's own list. The props exist so one source compiles for both.
   */
  sheetClassName?: string
  scrimClassName?: string
  optionClassName?: string
  /** What the Native fallback's dismiss says. Unused here. */
  cancelLabel?: string
  testID?: string
  onBlur?: () => void
  onFocus?: () => void
}

/**
 * Someone who can present the platform's own list of choices, on React Native.
 *
 * The seam, and the reason this component is worth having at all. See the
 * component's own comment for what fills it and why Hozo does not.
 *
 * On the Web it is accepted and ignored: a `<select>` *is* the operating system's
 * picker here -- it is what opens the wheel on iOS Safari and the dropdown on
 * Android Chrome -- so there is nothing for a presenter to present. It exists on
 * this side only so that an application can wrap its tree once and compile for
 * both platforms.
 */
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
 * A select that hands the choosing to the platform.
 *
 * #143's last control, and the one this repository had already argued against
 * itself: `@hozo/form`'s README explains why the date grid is the answer rather
 * than `<input type="date">` and `UIDatePicker` -- an operating system's picker
 * cannot be styled, which is against the premise that one `className` means the
 * same thing on both platforms.
 *
 * A `<select>` survives that argument where a date input does not, for two
 * reasons:
 *
 * - **A `<select>` is already the platform's picker on the Web.** It opens the
 *   wheel on iOS Safari and the dropdown on Android Chrome. So this is not one
 *   platform's widget against our own; it is the same decision on both sides --
 *   the operating system owns the choosing.
 * - **Its closed state is styleable and its open list is not.** `className` still
 *   means something here, which is a difference in kind from `UIDatePicker`,
 *   where nothing is.
 *
 * And the case for it is the one a user made: on a phone the platform's own list
 * is often simply better -- its momentum, its rotor behaviour, its dictation, and
 * the fact that it keeps up with the operating system without anybody shipping an
 * update. A two-hundred-option list in a portal is worse than the wheel.
 *
 * ## The Web half is the whole Web implementation
 *
 * One `<select>`, no runtime, no portal, no focus management. It is the component
 * in the library with the least code behind it and the most platform behind it,
 * which is the point rather than a shortcut.
 */
export function HozoNativeSelect({
  options,
  value: controlled,
  defaultValue = '',
  onValueChange,
  placeholder,
  accessibilityLabel,
  accessibilityLabelledBy,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  'aria-required': required,
  disabled,
  name,
  id,
  className,
  testID,
  onBlur,
  onFocus,
}: HozoNativeSelectProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const current = controlled ?? uncontrolled

  return (
    <select
      id={id}
      name={name}
      value={current}
      disabled={disabled}
      aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
      aria-labelledby={accessibilityLabelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid ? 'true' : undefined}
      aria-required={required ? true : undefined}
      // Twice, because `disabled:` compiles to `[data-hozo-disabled]` in this
      // project (decision 001) and a real `<select disabled>` would be styled by
      // nothing. The attribute is for the class list, the property for the
      // platform.
      data-hozo-disabled={disabled ? '' : undefined}
      data-testid={testID}
      className={className}
      onChange={(event) => {
        const next = event.currentTarget.value
        if (controlled === undefined) setUncontrolled(next)
        onValueChange?.(next)
      }}
      onBlur={onBlur}
      onFocus={onFocus}
    >
      {placeholder === undefined ? null : <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export {
  HozoNativeSelect as NativeSelect,
  type HozoNativeSelectOption as NativeSelectOption,
  type HozoNativeSelectProps as NativeSelectProps,
}
