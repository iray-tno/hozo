import type { ComponentType } from 'react'
import * as ReactNative from 'react-native'

export type HozoTouchableWithoutFeedbackProps = ReactNative.TouchableWithoutFeedbackProps & {
  /** Tailwind classes the compiler removes before this component runs. */
  className?: string
}

// Native lowering normally imports the React Native primitive directly.
export const HozoTouchableWithoutFeedback =
  ReactNative.TouchableWithoutFeedback as ComponentType<HozoTouchableWithoutFeedbackProps>
