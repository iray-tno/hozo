import type { useHozoMessage } from '@hozo/behaviors'

/**
 * Where each step of a process stands, and what a reader is told about it.
 *
 * A step before `activeStep` is completed, the one at it is current, the
 * ones after are upcoming -- unless the step says otherwise. `error` is only
 * ever said by the step: nothing about position makes a step wrong.
 */

export type HozoStepStatus = 'completed' | 'current' | 'upcoming' | 'error'

export interface HozoStep {
  label: string
  description?: string
  /** Overrides the status `activeStep` gives this step. */
  status?: HozoStepStatus
  /** With `onStepPress`, makes this one step not pressable. */
  disabled?: boolean
}

export function stepStatus(step: HozoStep, index: number, activeStep: number): HozoStepStatus {
  if (step.status) return step.status
  return index < activeStep ? 'completed' : index === activeStep ? 'current' : 'upcoming'
}

const STATUS_KEY = {
  completed: 'hozo.stepper.completed',
  current: 'hozo.stepper.current',
  upcoming: 'hozo.stepper.upcoming',
  error: 'hozo.stepper.error',
} as const

/**
 * "Step 2 of 3: Profile, current" -- position, name and status in words,
 * so the state is never carried by colour alone (WCAG 1.4.1).
 */
export function stepLabel(
  message: ReturnType<typeof useHozoMessage>,
  step: HozoStep,
  index: number,
  count: number,
  status: HozoStepStatus,
): string {
  return message('hozo.stepper.step', {
    step: index + 1,
    count,
    label: step.label,
    status: message(STATUS_KEY[status]),
  })
}

/** What the indicator draws: the number, or a mark for done and wrong. */
export function stepMark(index: number, status: HozoStepStatus): string {
  return status === 'completed' ? '✓' : status === 'error' ? '!' : String(index + 1)
}
