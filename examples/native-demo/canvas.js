// A second entry, bundled separately on purpose.
//
// Skia is an optional peer and a multi-megabyte one. Folding it into the
// main demo pushed that bundle from 4.4 MB to 5.7 MB, and the budget
// there exists to measure what Hozo costs a typical React Native app --
// a number that stops meaning anything once an optional renderer most
// apps never install is inside it.
import { AppRegistry } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { CanvasBench } from './CanvasBench.tsx'

function Root() {
  return (
    <SafeAreaProvider>
      <CanvasBench />
    </SafeAreaProvider>
  )
}

// MainActivity intentionally stays identical to the ordinary acceptance app.
// The Gradle entry-file switch changes the scene, not the Android shell around
// it, which keeps this check about Canvas rather than a second app template.
AppRegistry.registerComponent('HozoNativeDemo', () => Root)
