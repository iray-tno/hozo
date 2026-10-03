// A second entry, bundled separately on purpose.
//
// Skia is an optional peer and a multi-megabyte one. Folding it into the
// main demo pushed that bundle from 4.4 MB to 5.7 MB, and the budget
// there exists to measure what Hozo costs a typical React Native app --
// a number that stops meaning anything once an optional renderer most
// apps never install is inside it.

import { Button, View } from '@hozo/core'
import { useEffect, useState } from 'react'
import { AppRegistry } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { CanvasBench } from './CanvasBench.tsx'
import { ThreeCorpusBench } from './ThreeCorpusBench.tsx'

function Root() {
  const [screen, setScreen] = useState('canvas')
  // Three markers on the way back from the Three corpus, for the harness's
  // log when the Canvas checks do not return (#714): the press reaching
  // JavaScript, React committing the switch, and Android laying out the
  // Canvas screen's view. Which of them appear says where it stopped -- a tap
  // that never arrived, or a switch React made and the screen did not.
  useEffect(() => {
    console.info(`[hozo-canvas-screen] committed ${screen}`)
  }, [screen])
  return (
    <SafeAreaProvider>
      {screen === 'canvas' ? (
        // Keep the harness switch below Android's status bar. SafeAreaProvider
        // supplies context but does not apply insets by itself, and an ADB tap
        // at the centre of a control under the status bar reaches System UI.
        <View
          style={{ paddingTop: 24 }}
          onLayout={() => console.info('[hozo-canvas-screen] canvas laid out')}
        >
          <Button testID="show-three-corpus" onPress={() => setScreen('three')}>
            Show Three corpus
          </Button>
          <CanvasBench />
        </View>
      ) : (
        <ThreeCorpusBench
          onBack={() => {
            console.info('[hozo-canvas-screen] back pressed')
            setScreen('canvas')
          }}
        />
      )}
    </SafeAreaProvider>
  )
}

// MainActivity intentionally stays identical to the ordinary acceptance app.
// The Gradle entry-file switch changes the scene, not the Android shell around
// it, which keeps this check about Canvas rather than a second app template.
AppRegistry.registerComponent('HozoNativeDemo', () => Root)
