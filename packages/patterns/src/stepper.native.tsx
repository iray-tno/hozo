import { useHozoMessage } from '@hozo/behaviors'
import { hozoClasses } from '@hozo/engine/project'
import { type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
import { type InteractionState, Pressable } from './pressable.native.tsx'
import {
  type HozoStep,
  type HozoStepStatus,
  stepLabel,
  stepMark,
  stepStatus,
} from './stepper-rules.ts'
import { splitTextStyle } from './text-style.native.ts'

export type { HozoStep, HozoStepStatus }

type Style = StyleProp<ViewStyle | TextStyle>
type StepStyle = (
  state: InteractionState & { interactionAvailable: boolean; disabled: boolean; enabled: boolean },
) => Style

export interface HozoStepperProps {
  steps: readonly HozoStep[]
  activeStep: number
  onStepPress?: (index: number) => void
  accessibilityLabel?: string
  /**
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as the style props below; a file it did
   * not read leaves them here as strings, resolved through the project's
   * candidate map (#886) before the matching style prop.
   */
  className?: string
  stepClassName?: string
  completedStepClassName?: string
  currentStepClassName?: string
  errorStepClassName?: string
  indicatorClassName?: string
  completedIndicatorClassName?: string
  currentIndicatorClassName?: string
  errorIndicatorClassName?: string
  descriptionClassName?: string
  style?: Style
  stepStyle?: Style
  completedStepStyle?: Style
  currentStepStyle?: Style
  errorStepStyle?: Style
  indicatorStyle?: Style
  completedIndicatorStyle?: Style
  currentIndicatorStyle?: Style
  errorIndicatorStyle?: Style
  descriptionStyle?: Style
  /** Compiler-only callbacks for the step button, never its decorative children. */
  hozoStepStyle?: StepStyle
  hozoCompletedStepStyle?: StepStyle
  hozoCurrentStepStyle?: StepStyle
  hozoErrorStepStyle?: StepStyle
  testID?: string
}

/**
 * Where a person is in a process of several steps, on React Native: each
 * step one element for a screen reader, named with its position and status
 * -- "Step 2 of 3: Profile, current" -- and a button when `onStepPress` is
 * given. The current step is `selected`, the nearest thing Android has to
 * `aria-current`. The text half of each style goes to the step's label and
 * mark, where a `Text` can draw it.
 */
export function HozoStepper({
  steps,
  activeStep,
  onStepPress,
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
  style,
  stepStyle,
  completedStepStyle,
  currentStepStyle,
  errorStepStyle,
  indicatorStyle,
  completedIndicatorStyle,
  currentIndicatorStyle,
  errorIndicatorStyle,
  descriptionStyle,
  hozoStepStyle,
  hozoCompletedStepStyle,
  hozoCurrentStepStyle,
  hozoErrorStepStyle,
  testID,
}: HozoStepperProps) {
  const message = useHozoMessage()
  // A class list resolved ahead of the style prop that goes with it.
  const styled = (
    classes: string | undefined,
    own: Style,
    state?: Readonly<Record<string, unknown>>,
  ): Style => [hozoClasses(classes, state), own]
  const byStatus = (status: HozoStepStatus, completed: Style, current: Style, error: Style) =>
    status === 'completed'
      ? completed
      : status === 'current'
        ? current
        : status === 'error'
          ? error
          : undefined
  const [box, listText] = splitTextStyle(styled(className, style))

  return (
    <View style={box} testID={testID}>
      {steps.map((step, index) => {
        const status = stepStatus(step, index, activeStep)
        // A clickable step owns its box's facts; its text styles are inherited.
        // A descriptive step stays a View and has no fabricated interaction.
        const look = (interaction?: InteractionState) => {
          // These are facts of the Web class owner: a disabled/enabled button
          // or a descriptive li, neither of which writes these aria attributes.
          // Native selected announcements below intentionally stay independent.
          const state = {
            ...interaction,
            disabled: interaction !== undefined && Boolean(step.disabled),
            enabled: interaction !== undefined && !step.disabled,
            'aria-disabled': false,
            'aria-selected': false,
          }
          const compiledState = {
            pressed: false,
            hovered: false,
            focused: false,
            focusVisible: false,
            ...state,
            interactionAvailable: interaction !== undefined,
          }
          const [stepBox, stepText] = splitTextStyle([
            hozoClasses(stepClassName, state),
            hozoStepStyle?.(compiledState),
            stepStyle,
            byStatus(
              status,
              [
                hozoClasses(completedStepClassName, state),
                hozoCompletedStepStyle?.(compiledState),
                completedStepStyle,
              ],
              [
                hozoClasses(currentStepClassName, state),
                hozoCurrentStepStyle?.(compiledState),
                currentStepStyle,
              ],
              [
                hozoClasses(errorStepClassName, state),
                hozoErrorStepStyle?.(compiledState),
                errorStepStyle,
              ],
            ),
          ])
          // Web indicators and descriptions are unfocusable spans. Keep the
          // button's text inheritance without lending them button semantics.
          const decorationState = {
            ...state,
            disabled: false,
            enabled: false,
            focused: false,
            focusVisible: false,
          }
          const [markBox, markText] = splitTextStyle([
            styled(indicatorClassName, indicatorStyle, decorationState),
            byStatus(
              status,
              styled(completedIndicatorClassName, completedIndicatorStyle, decorationState),
              styled(currentIndicatorClassName, currentIndicatorStyle, decorationState),
              styled(errorIndicatorClassName, errorIndicatorStyle, decorationState),
            ),
          ])
          const [descriptionBox, descriptionText] = splitTextStyle(
            styled(descriptionClassName, descriptionStyle, decorationState),
          )
          return { stepBox, stepText, markBox, markText, descriptionBox, descriptionText }
        }
        const content = (interaction?: InteractionState) => {
          const { stepText, markBox, markText, descriptionBox, descriptionText } = look(interaction)
          return (
            <>
              <View style={[CENTRED, markBox]}>
                <Text style={[listText, stepText, markText]}>{stepMark(index, status)}</Text>
              </View>
              <View>
                <Text style={[listText, stepText]}>{step.label}</Text>
                {step.description ? (
                  <View style={descriptionBox}>
                    <Text style={[listText, stepText, descriptionText]}>{step.description}</Text>
                  </View>
                ) : null}
              </View>
            </>
          )
        }
        const common = {
          accessible: true,
          accessibilityLabel: stepLabel(message, step, index, steps.length, status),
          accessibilityHint: step.description,
        }
        return onStepPress ? (
          <Pressable
            key={step.label}
            {...common}
            accessibilityRole="button"
            accessibilityState={{
              selected: status === 'current',
              disabled: Boolean(step.disabled),
            }}
            disabled={step.disabled}
            style={(interaction) => [ROW, look(interaction).stepBox]}
            onPress={() => onStepPress(index)}
          >
            {(interaction) => content(interaction)}
          </Pressable>
        ) : (
          <View
            key={step.label}
            {...common}
            accessibilityState={{ selected: status === 'current' }}
            style={[ROW, look().stepBox]}
          >
            {content()}
          </View>
        )
      })}
    </View>
  )
}

const ROW: ViewStyle = { flexDirection: 'row', alignItems: 'center' }
const CENTRED: ViewStyle = { alignItems: 'center', justifyContent: 'center' }

export { HozoStepper as Stepper, type HozoStepperProps as StepperProps }
