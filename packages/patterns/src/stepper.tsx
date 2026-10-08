import { useHozoMessage } from '@hozo/behaviors'
import {
  type HozoStep,
  type HozoStepStatus,
  stepLabel,
  stepMark,
  stepStatus,
} from './stepper-rules.ts'

export type { HozoStep, HozoStepStatus }

export interface HozoStepperProps {
  steps: readonly HozoStep[]
  /** The current step, counted from 0. */
  activeStep: number
  /**
   * Makes the steps buttons, for a process that can go back -- or jump
   * ahead, if the application allows it. Left out, the steps are a list a
   * reader reads and nothing to press.
   */
  onStepPress?: (index: number) => void
  /** The list's name, "Progress" by default. */
  accessibilityLabel?: string
  /** The list of steps. */
  className?: string
  /** Every step. */
  stepClassName?: string
  completedStepClassName?: string
  currentStepClassName?: string
  errorStepClassName?: string
  /** The number or mark beside each step's label. */
  indicatorClassName?: string
  completedIndicatorClassName?: string
  currentIndicatorClassName?: string
  errorIndicatorClassName?: string
  descriptionClassName?: string
  testID?: string
}

/**
 * Where a person is in a process of several steps (#150).
 *
 * ## Said in words, not only in colour
 *
 * An ordered list, the current step `aria-current="step"`, and each step's
 * position and status written out for a reader: "Step 2 of 3: Profile,
 * current". The number or check mark beside the label is hidden, because
 * the words already say it. A status shown only by a green circle is the
 * failure WCAG 1.4.1 describes, and the one a stepper most often has.
 *
 * ## State is styled by class lists, not selectors
 *
 * Each status has a class list for the step and one for its indicator,
 * applied by this component, for the reason `Pagination` gives: React
 * Native has no selector to read `aria-current` with, and a look that
 * needed one would be a look one platform lacks.
 */
export function HozoStepper({
  steps,
  activeStep,
  onStepPress,
  accessibilityLabel,
  className,
  stepClassName,
  completedStepClassName,
  currentStepClassName,
  errorStepClassName,
  indicatorClassName,
  completedIndicatorClassName,
  currentIndicatorClassName,
  errorIndicatorClassName,
  descriptionClassName,
  testID,
}: HozoStepperProps) {
  const message = useHozoMessage()
  const join = (...names: (string | false | undefined)[]) =>
    names.filter(Boolean).join(' ') || undefined
  const byStatus = (
    status: HozoStepStatus,
    completed?: string,
    current?: string,
    error?: string,
  ) =>
    status === 'completed'
      ? completed
      : status === 'current'
        ? current
        : status === 'error'
          ? error
          : undefined

  return (
    <ol
      aria-label={message('hozo.stepper.label', {}, accessibilityLabel)}
      className={className}
      style={UNMARKED}
      data-testid={testID}
    >
      {steps.map((step, index) => {
        const status = stepStatus(step, index, activeStep)
        const body = (
          <>
            <span
              aria-hidden
              className={join(
                indicatorClassName,
                byStatus(
                  status,
                  completedIndicatorClassName,
                  currentIndicatorClassName,
                  errorIndicatorClassName,
                ),
              )}
            >
              {stepMark(index, status)}
            </span>
            {/* The description is part of the sentence a reader hears, after
                a full stop, and hidden where it is drawn. Read beside the
                sentence instead, VoiceOver ran the two together --
                "completedEmail and password" -- and a space between them did
                not survive, because the sentence is absolutely positioned
                (runs 37790021610 and 37796061776). */}
            <span style={VISUALLY_HIDDEN}>
              {stepLabel(message, step, index, steps.length, status)}
              {step.description ? `. ${step.description}` : null}
            </span>
            <span aria-hidden>{step.label}</span>
            {step.description ? (
              <span aria-hidden className={descriptionClassName}>
                {step.description}
              </span>
            ) : null}
          </>
        )
        const classes = join(
          stepClassName,
          byStatus(status, completedStepClassName, currentStepClassName, errorStepClassName),
        )
        // A pressable step is its button: the class lists go on it, so the
        // focus ring and the look are on the thing that takes focus.
        return (
          <li
            key={step.label}
            aria-current={status === 'current' ? 'step' : undefined}
            className={onStepPress ? undefined : classes}
            data-hozo-state={status}
          >
            {onStepPress ? (
              <button
                type="button"
                disabled={step.disabled}
                className={classes}
                data-hozo-state={status}
                onClick={() => onStepPress(index)}
              >
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** No numbers from the browser: the indicator is the number. */
const UNMARKED = { listStyle: 'none' } as const

/**
 * In the accessibility tree and nowhere on screen. Inline because a
 * pattern ships no stylesheet, and this is behaviour rather than look:
 * without it the sentence a reader needs would be drawn as well.
 */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

export { HozoStepper as Stepper, type HozoStepperProps as StepperProps }
