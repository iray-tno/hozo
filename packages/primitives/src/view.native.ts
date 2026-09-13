import * as ReactNative from 'react-native'

export type HozoViewProps = ReactNative.ViewProps

// Native lowering normally imports View directly. The paired export keeps
// platform resolution safe for source that explicitly uses the fallback.
export const HozoView = ReactNative.View
