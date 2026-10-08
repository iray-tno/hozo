/**
 * A stepper with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is the pattern's: each step's status from `activeStep`, said
 * in words, the steps buttons when they can be pressed. This file draws a
 * numbered circle per step -- outlined while upcoming, filled when current
 * or done, the danger colour on an error -- through the pattern's status
 * class lists, which reach React Native as well as the Web.
 */

import { Stepper, type StepperProps } from '@hozo/core'

export type HozoStepperProps = StepperProps

const list = 'flex flex-col gap-3 text-sm text-hozo-text-body'
const step = 'flex-row items-center gap-3 rounded-hozo-control'
const indicator =
  'size-7 items-center justify-center rounded-full border-2 border-hozo-border-strong text-xs font-medium text-hozo-text-subtle'
const indicatorDone = 'border-hozo-accent bg-hozo-accent text-hozo-on-accent'
const indicatorCurrent = 'border-hozo-accent text-hozo-accent-text'
const indicatorError = 'border-hozo-danger bg-hozo-danger text-hozo-on-danger'
const current = 'font-medium text-hozo-text'
const description = 'text-xs text-hozo-text-subtle'

const plus = (own: string, extra: string | undefined) => (extra ? `${own} ${extra}` : own)

// Not named `HozoStepper` here: compiled output imports a runtime component
// under that name for the `<Stepper>` below (#670).
function StyledStepper({
  className,
  stepClassName,
  currentStepClassName,
  indicatorClassName,
  completedIndicatorClassName,
  currentIndicatorClassName,
  errorIndicatorClassName,
  descriptionClassName,
  ...rest
}: HozoStepperProps) {
  return (
    <Stepper
      {...rest}
      className={plus(list, className)}
      stepClassName={plus(step, stepClassName)}
      currentStepClassName={plus(current, currentStepClassName)}
      indicatorClassName={plus(indicator, indicatorClassName)}
      completedIndicatorClassName={plus(indicatorDone, completedIndicatorClassName)}
      currentIndicatorClassName={plus(indicatorCurrent, currentIndicatorClassName)}
      errorIndicatorClassName={plus(indicatorError, errorIndicatorClassName)}
      descriptionClassName={plus(description, descriptionClassName)}
    />
  )
}

export {
  type HozoStepperProps as StepperProps,
  StyledStepper as HozoStepper,
  StyledStepper as Stepper,
}
