// The React Native glue for `./ambient.ts`. Deliberately thin -- all the
// logic worth testing lives there, free of `react`/`react-native` imports
// so it can be tested without a device or a native module registry. This
// file is the part that can only be verified by running an app, same
// division as `@hozo/metro`'s `index.ts`.
//
// Generated components call these; nothing here is meant to be imported by
// hand.

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Appearance,
  Dimensions,
  Easing,
  I18nManager,
  type ScaledSize,
} from 'react-native'

import {
  bucketFor,
  createStore,
  isAtLeast,
  sameViewport,
  isPortrait,
  ENVIRONMENT_FACTS,
  type BreakpointName,
  type EnvironmentQuery,
  type Viewport,
} from './ambient.ts'

/// `Dimensions` hands back more than the two numbers wanted here (`scale`,
/// `fontScale`), and a fresh object every event. Narrowing it is what makes
/// the store's change check able to see that nothing moved.
function viewportOf({ width, height }: { width: number; height: number }): Viewport {
  return { width, height }
}

// One subscription per app, not per component. See ./ambient.ts.

const darkStore = createStore(Appearance.getColorScheme() === 'dark')
Appearance.addChangeListener(({ colorScheme }) => {
  darkStore.set(colorScheme === 'dark')
})

const breakpointStore = createStore(bucketFor(Dimensions.get('window').width))
// A second store over the same event, holding the size itself rather than
// the bucket. Kept separate on purpose: a component using only `md:`
// must not re-render on every resize that doesn't cross a breakpoint, and
// it wouldn't if these shared one snapshot.
const viewportStore = createStore(viewportOf(Dimensions.get('window')), sameViewport)
Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
  breakpointStore.set(bucketFor(window.width))
  viewportStore.set(viewportOf(window))
})

/** Whether the OS is in dark mode. Drives `dark:` utilities. */
export function useHozoDark(): boolean {
  return useSyncExternalStore(darkStore.subscribe, darkStore.get, darkStore.get)
}

/**
 * Whether the viewport is at least as wide as `name`'s breakpoint. Drives
 * `sm:`/`md:`/`lg:`/`xl:`/`2xl:` utilities.
 *
 * Takes the name rather than returning the current bucket so the call
 * reads as the condition it was compiled from: `md:` becomes
 * `useHozoBreakpoint('md')`.
 */
export function useHozoBreakpoint(name: BreakpointName): boolean {
  const bucket = useSyncExternalStore(
    breakpointStore.subscribe,
    breakpointStore.get,
    breakpointStore.get,
  )
  return isAtLeast(bucket, name)
}

/**
 * Whether the window is at least `px` wide. Drives `min-[500px]:` and,
 * negated, `max-[…]:` and `max-<breakpoint>:`.
 *
 * A threshold rather than a bucket, because an arbitrary one is by
 * definition not one of the five. Just as cheap, though, and for a reason
 * worth stating: the snapshot is the *predicate*, not the width, so React
 * compares a boolean and skips the render on every resize that doesn't
 * cross `px`. Rounding to buckets buys nothing over that -- it is the
 * older of the two ideas, not the cheaper one.
 */
export function useHozoWidthAtLeast(px: number): boolean {
  return useSyncExternalStore(
    viewportStore.subscribe,
    () => viewportStore.get().width >= px,
    () => viewportStore.get().width >= px,
  )
}

/**
 * The current window size. Drives the viewport-relative sizes -- `h-screen`
 * compiles to `{ height: useHozoViewport().height }`.
 *
 * The window, not the screen: the window excludes system UI the app can't
 * draw under, which is the closer analogue of the Web viewport. It does not
 * subtract a notch or a home indicator, so a full-bleed layout still wants
 * a safe-area inset on top of this -- exactly as it does on Web.
 *
 * Unlike the two above, this re-renders on every window change rather than
 * only when a breakpoint is crossed. That is unavoidable for a size that
 * has to track the window exactly, and it's why this is a separate store
 * rather than the breakpoints being rebuilt on top of it.
 */
export function useHozoViewport(): Viewport {
  return useSyncExternalStore(viewportStore.subscribe, viewportStore.get, viewportStore.get)
}

/** Tailwind's `animate-spin`: one clockwise turn per second, forever. */
export function useHozoSpin() {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    animation.start()
    return () => animation.stop()
  }, [progress])

  return useMemo(
    () => ({
      transform: [
        {
          rotate: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          }),
        },
      ],
    }),
    [progress],
  )
}

// The environment queries, on the same one-subscription-per-app footing as
// `dark:` above. Four facts answer seven queries: `motion-safe` is
// `motion-reduce` negated, `landscape` is `portrait` negated, `ltr` is
// `rtl` negated.

const reduceMotionStore = createStore(false)
const invertColorsStore = createStore(false)
const orientationStore = createStore(isPortrait(Dimensions.get('window')))
// The four Tailwind has no name for. Three are iOS-only, and React Native
// resolves those to `false` on Android rather than rejecting them, so
// nothing here needs a platform check: a style that does not fire where
// the setting does not exist is correct.
const reduceTransparencyStore = createStore(false)
const boldTextStore = createStore(false)
const grayscaleStore = createStore(false)
const screenReaderStore = createStore(false)

// Asynchronous, unlike `Appearance.getColorScheme()`: these cross to the
// platform. The store starts at `false` and corrects itself, which is the
// right way round -- a first frame that under-reports reduced motion
// animates once, and one that over-reports it silently drops an animation
// the user asked for.
void AccessibilityInfo.isReduceMotionEnabled().then((value) => reduceMotionStore.set(value))
void AccessibilityInfo.isInvertColorsEnabled().then((value) => invertColorsStore.set(value))
AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => reduceMotionStore.set(value))
AccessibilityInfo.addEventListener('invertColorsChanged', (value) => invertColorsStore.set(value))
// Asked for by name rather than called directly, because this runs at
// import time and a missing method there takes the whole app down before
// anything renders. These four are newer than the two above and are not
// all present on every React Native version or every platform's native
// module -- and a setting Hozo cannot read is a `false`, which is what the
// store already holds.
function track(
  read: keyof typeof AccessibilityInfo,
  event: Parameters<typeof AccessibilityInfo.addEventListener>[0],
  store: { set: (value: boolean) => void },
) {
  const method = AccessibilityInfo[read]
  if (typeof method !== 'function') return
  void (method as () => Promise<boolean>)
    .call(AccessibilityInfo)
    .then((value) => store.set(value))
    // A rejection is the same answer as a missing method: unknown, and
    // `false` is the safe reading of unknown for all four.
    .catch(() => {})
  AccessibilityInfo.addEventListener(event, (value) => store.set(value as boolean))
}

track('isReduceTransparencyEnabled', 'reduceTransparencyChanged', reduceTransparencyStore)
track('isBoldTextEnabled', 'boldTextChanged', boldTextStore)
track('isGrayscaleEnabled', 'grayscaleChanged', grayscaleStore)
// The one that changes mid-session more than any of the others: someone
// turning VoiceOver on to read a screen they are already looking at is the
// ordinary case, not an edge one.
track('isScreenReaderEnabled', 'screenReaderChanged', screenReaderStore)
Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
  orientationStore.set(isPortrait(window))
})

/**
 * Whether an environment query holds. Drives `motion-reduce:`, `ltr:` and
 * the rest.
 *
 * `I18nManager.isRTL` has no store because it has no event: React Native
 * requires a reload for a direction change to take effect, so within one
 * run it is a constant.
 */
export function useHozoEnvironment(query: EnvironmentQuery): boolean {
  const { fact, negate } = ENVIRONMENT_FACTS[query]
  const reduceMotion = useSyncExternalStore(
    reduceMotionStore.subscribe,
    reduceMotionStore.get,
    reduceMotionStore.get,
  )
  const invertColors = useSyncExternalStore(
    invertColorsStore.subscribe,
    invertColorsStore.get,
    invertColorsStore.get,
  )
  const portrait = useSyncExternalStore(
    orientationStore.subscribe,
    orientationStore.get,
    orientationStore.get,
  )
  const reduceTransparency = useSyncExternalStore(
    reduceTransparencyStore.subscribe,
    reduceTransparencyStore.get,
    reduceTransparencyStore.get,
  )
  const boldText = useSyncExternalStore(
    boldTextStore.subscribe,
    boldTextStore.get,
    boldTextStore.get,
  )
  const grayscale = useSyncExternalStore(
    grayscaleStore.subscribe,
    grayscaleStore.get,
    grayscaleStore.get,
  )
  const screenReader = useSyncExternalStore(
    screenReaderStore.subscribe,
    screenReaderStore.get,
    screenReaderStore.get,
  )
  const value = {
    reduceMotion,
    invertColors,
    portrait,
    rtl: I18nManager.isRTL,
    reduceTransparency,
    boldText,
    grayscale,
    screenReader,
  }[fact]
  return negate ? !value : value
}
