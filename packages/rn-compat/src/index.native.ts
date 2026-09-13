import * as ReactNative from 'react-native'

import { HozoActivityIndicator } from './activity-indicator.native.ts'
import { HozoAnimatedView } from './animated-view.native.ts'
import { HozoModal } from './modal.native.ts'
import { HozoTouchableOpacity } from './touchable-opacity.native.ts'
import { HozoTouchableWithoutFeedback } from './touchable-without-feedback.native.ts'

export const AccessibilityInfo = ReactNative.AccessibilityInfo
export const ActivityIndicator = HozoActivityIndicator
export { HozoActivityIndicator }
export type ActivityIndicatorProps = ReactNative.ActivityIndicatorProps
export type HozoActivityIndicatorProps = ReactNative.ActivityIndicatorProps
export const Animated = Object.freeze({ View: HozoAnimatedView })
export { HozoAnimatedView }
export type HozoAnimatedViewProps = ReactNative.Animated.AnimatedProps<ReactNative.ViewProps>
export type ColorSchemeName = ReactNative.ColorSchemeName
export const useColorScheme = ReactNative.useColorScheme
export const Dimensions = ReactNative.Dimensions
export type DimensionsChangeHandler = (value: {
  window: ReactNative.ScaledSize
  screen: ReactNative.ScaledSize
}) => void
export type DimensionsValue = {
  window: ReactNative.ScaledSize
  screen: ReactNative.ScaledSize
}
export type ScaledSize = ReactNative.ScaledSize
export const useWindowDimensions = ReactNative.useWindowDimensions
export const Keyboard = ReactNative.Keyboard
export type KeyboardSubscription = { remove(): void }
export const Modal = HozoModal
export { HozoModal }
export type ModalProps = ReactNative.ModalProps
export type HozoModalProps = ReactNative.ModalProps
export const PanResponder: typeof ReactNative.PanResponder = ReactNative.PanResponder
export type PanResponderCallbacks = ReactNative.PanResponderCallbacks
export type PanResponderGestureState = ReactNative.PanResponderGestureState
export type PanResponderInstance = ReactNative.PanResponderInstance
export const Platform: typeof ReactNative.Platform = ReactNative.Platform
export type PlatformSelectSpec<Value> = {
  web?: Value
  default?: Value
  [platform: string]: Value | undefined
}
export const StyleSheet = ReactNative.StyleSheet
export type HozoNamedStyles<T> = { [Name in keyof T]: Readonly<Record<string, unknown>> }
export type HozoStyle = ReactNative.StyleProp<ReactNative.ViewStyle | ReactNative.TextStyle>
export const TouchableOpacity = HozoTouchableOpacity
export { HozoTouchableOpacity }
export type TouchableOpacityProps = ReactNative.TouchableOpacityProps & { className?: string }
export type HozoTouchableOpacityProps = TouchableOpacityProps
export const TouchableWithoutFeedback = HozoTouchableWithoutFeedback
export { HozoTouchableWithoutFeedback }
export type TouchableWithoutFeedbackProps = ReactNative.TouchableWithoutFeedbackProps & {
  className?: string
}
export type HozoTouchableWithoutFeedbackProps = TouchableWithoutFeedbackProps
