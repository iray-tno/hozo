import { hozoViewBase } from '@hozo/engine'
import type {
  FocusEventHandler,
  KeyboardEventHandler,
  PointerEventHandler,
  ReactNode,
  Ref,
} from 'react'

export interface HozoSubmitButtonProps {
  children?: ReactNode
  className?: string
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  testID?: string
  /** Stable host ID: DOM id on Web, nativeID on React Native. */
  nativeID?: string
  /**
   * What a wrapper writes to make this a trigger, as `Button` takes them:
   * `Tooltip` positions against the ref, opens on these handlers, and names
   * its bubble with `aria-describedby`.
   */
  ref?: Ref<HTMLButtonElement>
  onFocus?: FocusEventHandler<HTMLElement>
  onBlur?: FocusEventHandler<HTMLElement>
  onKeyDown?: KeyboardEventHandler<HTMLElement>
  onPointerEnter?: PointerEventHandler<HTMLElement>
  onPointerLeave?: PointerEventHandler<HTMLElement>
  'aria-describedby'?: string
}

/**
 * The button that submits the enclosing `Form` (#1704).
 *
 * A real `<button type="submit">` here, which is the reason this is a component
 * and not a `type` prop on `Button`. A form with a submit button submits when
 * Enter is typed in any of its single-line fields; without one, only a form with
 * a single field does. `<Button onPress={useFormSubmit()}>` submits when pressed
 * and leaves Enter to that rule. On React Native neither exists, so `type` on
 * `Button` would be a prop that means nothing there -- and this component means
 * the same thing on both: pressing it submits the `Form` it is in.
 *
 * No `onPress`. What a submission does is the `Form`'s `onSubmit`, which also
 * runs for Enter, so a handler here would run for one of the two and not the
 * other.
 */
export function HozoSubmitButton({
  children,
  className,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  testID,
  nativeID,
  ref,
  onFocus,
  onBlur,
  onKeyDown,
  onPointerEnter,
  onPointerLeave,
  'aria-describedby': describedBy,
}: HozoSubmitButtonProps) {
  // Named rather than spread: what reaches the element is this list and no
  // more, the rule `Button` keeps for the same props.
  return (
    <>
      {hozoViewBase()}
      <button
        ref={ref}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        aria-describedby={describedBy}
        type="submit"
        className={className}
        disabled={disabled}
        data-hozo-disabled={disabled ? '' : undefined}
        aria-disabled={disabled}
        data-hozo-pressable={disabled ? undefined : ''}
        aria-label={accessibilityLabel}
        aria-description={accessibilityHint}
        data-testid={testID}
        id={nativeID}
      >
        {children}
      </button>
    </>
  )
}

export { HozoSubmitButton as SubmitButton, type HozoSubmitButtonProps as SubmitButtonProps }
