import { useHozoMessage } from '@hozo/behaviors'
import { Pressable, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native'
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

export interface HozoStepperProps {
  steps: readonly HozoStep[]
  activeStep: number
  onStepPress?: (index: number) => void
  accessibilityLabel?: string
  /**
   * Tailwind classes, the same props the Web half takes. Read by the
   * compiler, which hands them over as the style props below; a file it did
   * not read leaves them here, where a Native pattern has no class list to
   * resolve.
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
  testID,
}: HozoStepperProps) {
  const message = useHozoMessage()
  const byStatus = (status: HozoStepStatus, completed: Style, current: Style, error: Style) =>
    status === 'completed'
      ? completed
      : status === 'current'
        ? current
        : status === 'error'
          ? error
          : undefined
  const [box, listText] = splitTextStyle(style)
  const [descriptionBox, descriptionText] = splitTextStyle(descriptionStyle)

  return (
    <View style={box} testID={testID}>
      {steps.map((step, index) => {
        const status = stepStatus(step, index, activeStep)
        const [stepBox, stepText] = splitTextStyle([
          stepStyle,
          byStatus(status, completedStepStyle, currentStepStyle, errorStepStyle),
        ])
        const [markBox, markText] = splitTextStyle([
          indicatorStyle,
          byStatus(status, completedIndicatorStyle, currentIndicatorStyle, errorIndicatorStyle),
        ])
        const content = (
          <>
            <View style={[CENTRED, markBox]}>
              <Text style={[listText, stepText, markText]}>{stepMark(index, status)}</Text>
            </View>
            <View>
              <Text style={[listText, stepText]}>{step.label}</Text>
              {step.description ? (
                <View style={descriptionBox}>
                  <Text style={[listText, descriptionText]}>{step.description}</Text>
                </View>
              ) : null}
            </View>
          </>
        )
        const common = {
          accessible: true,
          accessibilityLabel: stepLabel(message, step, index, steps.length, status),
          accessibilityHint: step.description,
          style: [ROW, stepBox],
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
            onPress={() => onStepPress(index)}
          >
            {content}
          </Pressable>
        ) : (
          <View
            key={step.label}
            {...common}
            accessibilityState={{ selected: status === 'current' }}
          >
            {content}
          </View>
        )
      })}
    </View>
  )
}

const ROW: ViewStyle = { flexDirection: 'row', alignItems: 'center' }
const CENTRED: ViewStyle = { alignItems: 'center', justifyContent: 'center' }

export { HozoStepper as Stepper, type HozoStepperProps as StepperProps }
