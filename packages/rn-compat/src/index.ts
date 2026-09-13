// React Native-shaped APIs that exist to migrate existing applications.
// New Hozo code should prefer the canonical packages instead.

import { HozoAnimatedView } from './animated-view.ts'

export { AccessibilityInfo } from './accessibility-info.ts'
export {
  HozoActivityIndicator as ActivityIndicator,
  HozoActivityIndicator,
  type HozoActivityIndicatorProps as ActivityIndicatorProps,
  type HozoActivityIndicatorProps,
} from './activity-indicator.ts'
export { HozoAnimatedView, type HozoAnimatedViewProps } from './animated-view.ts'
export { type ColorSchemeName, useColorScheme } from './color-scheme.ts'
export {
  Dimensions,
  type DimensionsChangeHandler,
  type DimensionsValue,
  type ScaledSize,
  useWindowDimensions,
} from './dimensions.ts'
export { Keyboard, type KeyboardSubscription } from './keyboard.ts'
export {
  HozoModal as Modal,
  HozoModal,
  type HozoModalProps as ModalProps,
  type HozoModalProps,
} from './modal.ts'
export {
  PanResponder,
  type PanResponderCallbacks,
  type PanResponderGestureState,
  type PanResponderInstance,
} from './pan-responder.ts'
export { Platform, type PlatformSelectSpec } from './platform.ts'
export { type HozoNamedStyles, type HozoStyle, StyleSheet } from './stylesheet.ts'
export {
  HozoTouchableOpacity as TouchableOpacity,
  HozoTouchableOpacity,
  type HozoTouchableOpacityProps as TouchableOpacityProps,
  type HozoTouchableOpacityProps,
} from './touchable-opacity.ts'
export {
  HozoTouchableWithoutFeedback as TouchableWithoutFeedback,
  HozoTouchableWithoutFeedback,
  type HozoTouchableWithoutFeedbackProps as TouchableWithoutFeedbackProps,
  type HozoTouchableWithoutFeedbackProps,
} from './touchable-without-feedback.ts'

/** The supported Animated surface is deliberately limited to Animated.View. */
export const Animated = Object.freeze({ View: HozoAnimatedView })
