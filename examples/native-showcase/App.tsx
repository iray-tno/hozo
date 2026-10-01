import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Storybook from './.rnstorybook'

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Storybook />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
