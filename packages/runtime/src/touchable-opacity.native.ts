import * as ReactNative from 'react-native'

export type HozoTouchableOpacityProps = ReactNative.TouchableOpacityProps

// Native lowering normally imports TouchableOpacity directly. This export
// keeps the platform entry symmetric for source that reaches the fallback.
export const HozoTouchableOpacity = ReactNative.TouchableOpacity
