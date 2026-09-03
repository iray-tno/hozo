// A second entry, bundled separately on purpose.
//
// Skia is an optional peer and a multi-megabyte one. Folding it into the
// main demo pushed that bundle from 4.4 MB to 5.7 MB, and the budget
// there exists to measure what Hozo costs a typical React Native app --
// a number that stops meaning anything once an optional renderer most
// apps never install is inside it.
import { AppRegistry } from 'react-native'

import { CanvasBench } from './CanvasBench.tsx'

AppRegistry.registerComponent('HozoCanvasDemo', () => CanvasBench)
