import * as ReactNative from 'react-native'

export type { ActivityIndicatorProps as HozoActivityIndicatorProps } from 'react-native'

// Namespace access keeps lightweight test/platform shims that implement
// only the components they render loadable; a generated Native tree uses
// React Native's ActivityIndicator directly and never needs this fallback.
export const HozoActivityIndicator = ReactNative.ActivityIndicator
