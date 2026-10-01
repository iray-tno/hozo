import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react'

import { type FormControlState, firstInvalid, shouldSubmit } from './form-rules.ts'

export interface HozoFormProps {
  /**
   * Called when the form is submitted and nothing in it is marked invalid.
   *
   * No event argument. On the Web there is one and `preventDefault` has already
   * been called on it; on React Native there is nothing to hand over, and a
   * signature that differed between the platforms would be a prop an application
   * could not write once.
   */
  onSubmit?: () => void
  /** The form's accessible name, which is what makes it a landmark worth having. */
  accessibilityLabel?: string
  accessibilityLabelledBy?: string
  /**
   * Whether a submission with an invalid control in it moves focus there.
   *
   * True, and the one piece of coordination this component does. It reads
   * `aria-invalid` -- the attribute a `Field` already sets and a screen reader is
   * already reading -- finds the first control carrying it, and focuses that
   * instead of submitting. Nothing about which fields are invalid, or why, or in
   * what words, is this component's business; it only declines to submit past an
   * answer the application has already written down.
   *
   * False leaves the submission alone entirely, for a form that validates on the
   * server and has nothing marked yet.
   */
  focusInvalidOnSubmit?: boolean
  className?: string
  testID?: string
  children?: ReactNode
}

interface FormContextValue {
  submit: () => void
}

const FormContext = createContext<FormContextValue | null>(null)

/**
 * The submit the enclosing `Form` owns, for a control that has to ask for one.
 *
 * This is the whole cross-platform half of `Form`. A Web form submits itself when
 * a button inside it is pressed and when Enter is typed in a single-line field;
 * React Native has neither, so the last field's `onSubmitEditing` and the submit
 * button both need something to call. One hook, written once in the application.
 *
 * Returns a no-op outside a `Form` rather than throwing. A button that submits
 * when it is inside a form and does nothing when it is not is a reasonable thing
 * to render; a component that crashed the page because somebody moved it is not.
 */
export function useFormSubmit(): () => void {
  const context = useContext(FormContext)
  return useMemo(() => context?.submit ?? (() => {}), [context])
}

/**
 * A form, and the one thing it coordinates.
 *
 * #143's last container, and the smallest of its four controls on purpose. The
 * tempting version collects every field's errors, renders a summary, announces it
 * and owns the wording -- and the wording is exactly what Hozo does not own
 * ([#157](https://github.com/iray-tno/hozo/issues/157) is where a message
 * catalogue would have to live first). So this does two things: it turns a
 * submission into an `onSubmit` call with no event in it, and it declines to
 * submit past a control that is already marked `aria-invalid`, focusing that
 * control instead.
 *
 * That second one is worth the scope it costs. WCAG 3.3.1 is about telling
 * somebody *which* field is wrong, and a form that scrolls a sighted person to an
 * error while leaving a screen reader's focus on the submit button has told one of
 * them and not the other.
 *
 * ## `requestSubmit`, so there is one path and not two
 *
 * The hook does not call `onSubmit`. It calls the form element's
 * `requestSubmit()`, which fires the same `submit` event a button press does --
 * so a press through the hook, a press on a real submit button and Enter in a
 * field all arrive at one handler, in one order, with the platform's own
 * behaviour intact.
 *
 * ## The platform's validation is left switched on
 *
 * No `noValidate`. Hozo's `Field` marks its control with `aria-required` rather
 * than `required`, so the browser has nothing to catch unless the application
 * added a real constraint itself -- and if it did, silently disabling the feature
 * it reached for is not this component's decision to make.
 */
export function HozoForm({
  onSubmit,
  accessibilityLabel,
  accessibilityLabelledBy,
  focusInvalidOnSubmit = true,
  className,
  testID,
  children,
}: HozoFormProps) {
  const ref = useRef<HTMLFormElement>(null)

  const attempt = useCallback(() => {
    const form = ref.current
    if (!form || !focusInvalidOnSubmit) {
      onSubmit?.()
      return
    }
    // Document order, which is what `querySelectorAll` returns and what makes
    // "the first invalid one" mean the one highest up the page.
    const marked = [...form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')]
    const states: FormControlState[] = marked.map((element) => ({
      invalid: true,
      // A control can be marked invalid and be unreachable, and focusing it would
      // land on `<body>`. `tabIndex` of -1 is still focusable by script, so the
      // question is connectedness and whether it is disabled.
      focusable: element.isConnected && !element.hasAttribute('disabled'),
    }))
    const at = firstInvalid(states)
    if (at !== null) marked[at]?.focus()
    if (shouldSubmit(states)) onSubmit?.()
  }, [focusInvalidOnSubmit, onSubmit])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Always, and before anything else: a form that navigated because a handler
    // threw would lose the page.
    event.preventDefault()
    attempt()
  }

  const context = useMemo<FormContextValue>(
    () => ({ submit: () => ref.current?.requestSubmit() }),
    [],
  )

  return (
    <FormContext.Provider value={context}>
      <form
        ref={ref}
        aria-label={accessibilityLabelledBy ? undefined : accessibilityLabel}
        aria-labelledby={accessibilityLabelledBy}
        data-testid={testID}
        className={className}
        onSubmit={handleSubmit}
      >
        {children}
      </form>
    </FormContext.Provider>
  )
}

export { HozoForm as Form, type HozoFormProps as FormProps }
