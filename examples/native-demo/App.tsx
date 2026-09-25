// A bundle fixture and a device acceptance screen. Stable testIDs make
// manual VoiceOver/TalkBack and layout results reproducible.

import { Dialog, FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from '@hozo/core'
import { PanResponder } from '@hozo/rn-compat'
import { useEffect, useRef, useState } from 'react'
// What a ref to a host component holds on this platform. React Native names
// it, so it is taken from there rather than spelled again here: `View` is a
// function component in these types, and its *instance* is this.
import { AppState, type HostInstance, Modal } from 'react-native'

import CalendarScreen from './CalendarScreen.tsx'
import FormScreen from './FormScreen.tsx'
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
  const [showingCalendar, setShowingCalendar] = useState(false)
  const [showingPickers, setShowingPickers] = useState(false)
  const [gridWidth, setGridWidth] = useState(0)
  const [gesture, setGesture] = useState({ dx: 0, dy: 0, touches: 0 })
  // Where accessibility focus goes when the dialog closes. React Native
  // cannot be asked what holds it, so the dialog is told (#462).
  const continueRef = useRef<HostInstance | null>(null)
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

  // Device-only evidence for #484. The TalkBack harness reads these lines
  // from logcat after each dismissal, which distinguishes a missing Android
  // window-focus signal from a restore request that arrived and was ignored.
  // Console output is intentionally confined to the acceptance app; Dialog's
  // public API and production packages gain no diagnostic-only surface.
  useEffect(() => {
    const subscription = AppState.addEventListener('focus', () => {
      console.info('[hozo-dialog-focus] window-focus')
    })
    return () => subscription.remove()
  }, [])

  const openConfirmation = () => {
    console.info('[hozo-dialog-focus] open')
    setConfirming(true)
  }
  const closeConfirmation = () => {
    console.info('[hozo-dialog-focus] close')
    setConfirming(false)
  }

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
              ref={continueRef}
              className="rounded-lg bg-brand p-3 transition-colors duration-200 hover:bg-blue-700 focus-visible:bg-blue-800"
              accessibilityRole="button"
              accessibilityLabel="Review email address"
              onPress={openConfirmation}
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

            {/* No `testID`, deliberately, where its neighbour has one.
                `announcedByCompiler` reads this file by name and
                `missingOnDevice` fails on any `testID` here that is absent
                from the dump checked into `fixtures/` -- so adding one is a
                fixture regeneration, which needs a device run of its own.
                The TalkBack script finds this button the way it finds the
                dialog's opener: by what TalkBack says about it. */}
            <Pressable
              className="mt-2 rounded-lg bg-slate-200 p-3"
              accessibilityRole="button"
              accessibilityLabel="Show the calendar"
              onPress={() => setShowingCalendar(true)}
            >
              <Text className="text-center">Calendar</Text>
            </Pressable>

            {/* The same shape and the same class list as its neighbour, so
                `announcedByCompiler` sees no class it did not already see and
                this stays out of the fixtures. It costs the TalkBack walk one
                step, which is why `MAX_STEPS` there went up by four. */}
            <Pressable
              className="mt-2 rounded-lg bg-slate-200 p-3"
              accessibilityRole="button"
              accessibilityLabel="Show the pickers"
              onPress={() => setShowingPickers(true)}
            >
              <Text className="text-center">Pickers</Text>
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
        onClose={closeConfirmation}
        restoreFocusTo={continueRef}
        accessibilityLabel="Confirm your address"
        testID="smoke-dialog"
      >
        <Text className="text-lg font-bold">Is this right?</Text>
        <Text className="text-slate-600">{email}</Text>
      </Dialog>

      {/* A `Modal` over this screen rather than a replacement for it, which
          is how the Gallery button works and which cannot be used here.

          Replacing the screen unmounts this `FlatList`, and with TalkBack on
          that crashes React Native 0.87.1. Android clears accessibility
          focus as the focused view is removed, the event walks up to the
          `ScrollView`'s accessibility delegate, and
          `ReactScrollViewAccessibilityDelegate.kt:74` casts a null tag with
          `as ReadableMap` instead of `as?` -- while the comment two lines
          below it says the value is expected to be null sometimes.

          The Gallery button has the same shape and has never hit this,
          because the harness only presses it with TalkBack off. Measured in
          this PR's first device run: the app went away and TalkBack read the
          launcher. */}
      <Modal
        visible={showingCalendar}
        animationType="fade"
        onRequestClose={() => setShowingCalendar(false)}
      >
        <CalendarScreen />
      </Modal>

      {/* A second `Modal` rather than one screen switched between two
          contents, so that neither measurement can move the other: the
          calendar's forty-two step walk and the pickers' short one are read
          in separate sections, and a screen that held both would put the
          pickers inside the grid's Tab lap. */}
      <Modal
        visible={showingPickers}
        animationType="fade"
        onRequestClose={() => setShowingPickers(false)}
      >
        <FormScreen />
      </Modal>
    </View>
  )
}
