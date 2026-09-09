import type { ComponentType } from 'react'
import * as ReactNative from 'react-native'

export type HozoAnimatedViewProps = ReactNative.Animated.AnimatedProps<ReactNative.ViewProps>
export const HozoAnimatedView = ReactNative.Animated
  .View as unknown as ComponentType<HozoAnimatedViewProps>
