import type { ComponentType } from 'react'
import * as ReactNative from 'react-native'

export type HozoTouchableOpacityProps = ReactNative.TouchableOpacityProps & {
  /** Tailwind classes the compiler removes before this component runs. */
  className?: string
}

// Native lowering normally imports TouchableOpacity directly. This export
// keeps the platform entry symmetric for source that reaches the fallback.
export const HozoTouchableOpacity =
  ReactNative.TouchableOpacity as ComponentType<HozoTouchableOpacityProps>
