// A bundle fixture and a device acceptance screen. Stable testIDs make
// manual VoiceOver/TalkBack and layout results reproducible.

import {
  Dialog,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@hozo/core'
import { useRef, useState } from 'react'

import Gallery from './Gallery.tsx'

const rows = [
  { id: 'one', title: 'First virtual row' },
  { id: 'two', title: 'Second virtual row' },
  { id: 'three', title: 'Third virtual row' },
]

export default function App() {
  const [email, setEmail] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [showingGallery, setShowingGallery] = useState(false)
  const [gridWidth, setGridWidth] = useState(0)
  const [gesture, setGesture] = useState({ dx: 0, dy: 0, touches: 0 })
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, state) => Math.abs(state.dx) + Math.abs(state.dy) > 4,
      onPanResponderMove: (_event, state) => {
        setGesture({
          dx: Math.round(state.dx),
          dy: Math.round(state.dy),
          touches: state.numberActiveTouches,
        })
      },
    }),
  ).current

  // A second screen rather than a second registered component: an
  // activity launches one root, and the smoke script already knows how
  // to press a button. `Gallery.tsx` is the census the accessibility
  // contract needs -- every primitive at once, rather than the eight
  // this screen happens to arrange.
  if (showingGallery) return <Gallery />

  return (
    // The insets a notch and a home indicator take out of the window.
    // Written as the class Tailwind itself produces, which is the whole
    // point of #352: the browser resolves `env()` in the cascade and
    // React Native reads the same number from a hook, so one spelling
    // covers both. Before this the heading rendered *under* the Dynamic
    // Island -- the iOS job screenshots this screen, and that is how it
    // was found (#338).
    <View className="flex-1 bg-slate-50 text-slate-900 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <FlatList
        className="flex-1"
        accessibilityLabel="Hozo native acceptance screen"
        data={rows}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View className="p-6 space-y-4">
            <Text className="text-2xl font-bold">Hozo device checks</Text>

            <Image
              className="w-20 h-20 rounded-lg object-cover"
              src="https://reactnative.dev/img/tiny_logo.png"
              alt="React Native logo"
              testID="smoke-image"
            />

            <TextInput
              className="rounded-lg border border-slate-300 p-3 placeholder-slate-400"
              accessibilityLabel="Email address"
              accessibilityHint="Enter an address to review in the confirmation dialog"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              testID="smoke-input"
            />

            <ScrollView horizontal className="h-20" testID="smoke-horizontal-scroll">
              <View className="flex-row gap-2">
                <View className="w-32 rounded-lg bg-white p-3">
                  <Text>Card one</Text>
                </View>
                <View className="w-32 rounded-lg bg-white p-3">
                  <Text>Card two</Text>
                </View>
                <View className="w-32 rounded-lg bg-white p-3">
                  <Text>Card three</Text>
                </View>
                <View className="w-32 rounded-lg bg-white p-3">
                  <Text>Card four</Text>
                </View>
              </View>
            </ScrollView>

            <View
              className="grid grid-cols-2 gap-2"
              onLayout={({ nativeEvent }) => setGridWidth(Math.round(nativeEvent.layout.width))}
              testID="smoke-grid"
            >
              <View className="row-span-2 rounded-lg bg-white p-3">
                <Text>Tall</Text>
              </View>
              <View className="rounded-lg bg-white p-3">
                <Text>Top</Text>
              </View>
              <View className="rounded-lg bg-white p-3">
                <Text>Bottom</Text>
              </View>
            </View>
            <Text accessibilityLabel={`Measured grid width ${gridWidth}`}>
              Grid width: {gridWidth}px
            </Text>

            <View
              {...pan.panHandlers}
              className="rounded-lg border border-slate-300 bg-white p-3"
              testID="smoke-pan-responder"
            >
              <Text>
                Gesture: {gesture.dx}, {gesture.dy} ({gesture.touches} touches)
              </Text>
            </View>

            <Pressable
              className="rounded-lg bg-brand p-3 transition-colors duration-200 hover:bg-blue-700 focus-visible:bg-blue-800"
              accessibilityRole="button"
              accessibilityLabel="Review email address"
              onPress={() => setConfirming(true)}
              testID="smoke-interaction"
            >
              <Text className="text-center font-bold text-white">Continue</Text>
            </Pressable>

            {/* Beside Continue rather than at the foot of the screen.
                It was below the list, which put it at y=2315 of 2400 --
                inside the system gesture area, where a tap is a home
                gesture and not a press. The dump reports bounds for
                anything it can see, including things the app does not
                own the bottom of. */}
            <Pressable
              className="mt-2 rounded-lg bg-slate-200 p-3"
              accessibilityRole="button"
              accessibilityLabel="Show every primitive"
              onPress={() => setShowingGallery(true)}
              testID="smoke-gallery"
            >
              <Text className="text-center">Gallery</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View className="mx-6 mb-2 rounded-lg bg-white p-3" testID={`smoke-row-${item.id}`}>
            <Text>{item.title}</Text>
          </View>
        )}
        ListFooterComponent={<View className="h-6" />}
        testID="smoke-list"
      />

      <Dialog
        className="m-6 rounded-xl bg-white p-6"
        open={confirming}
        onClose={() => setConfirming(false)}
        accessibilityLabel="Confirm your address"
        testID="smoke-dialog"
      >
        <Text className="text-lg font-bold">Is this right?</Text>
        <Text className="text-slate-600">{email}</Text>
      </Dialog>
    </View>
  )
}
