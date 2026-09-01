// A transition driven by the style changing, rather than by an
// interaction.
//
// `./pressable.native.tsx` already animates, and it is built the other way
// round: it knows the four interaction booleans, calls the author's `style`
// function for each combination, and animates between the results. That
// shape is right there and wrong here, because the conditions this has to
// serve are ambient -- `dark:`, `md:`, `motion-reduce:` -- and the
// compiler expresses those as a guarded array, `[base, __hozoDark &&
// dark]`, which is already resolved by the time it arrives.
//
// So this one asks a simpler question: what did the style just become, and
// what was it before? Everything that differs and can be interpolated is
// animated to its new value; everything else is passed straight through.
// That covers the interaction case too, in principle, which is why this is
// not named after the conditions that prompted it.
//
// Colours run on the JavaScript driver and opacity and transforms do not.
// React Native cannot interpolate a colour natively, so mixing the two in
// one `Animated.timing` would drag the fast ones onto the slow driver.
// They are separate animations for that reason and not for tidiness.

import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'

export interface HozoTransitionSpec {
  duration: number
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

/** The colour properties worth animating, in the order they are read. */
const COLOR_KEYS = ['backgroundColor', 'borderColor', 'color'] as const

/**
 * The transform entries, flattened to `{ key: value }`.
 *
 * React Native's `transform` is an array of one-key objects, which is a
 * shape nothing can be diffed against directly -- two arrays with the same
 * entries in a different order are the same transform and not equal.
 */
function transformMap(style: ViewStyle | undefined): Map<string, number> {
  const out = new Map<string, number>()
  const transform = style?.transform
  if (!Array.isArray(transform)) return out
  for (const entry of transform) {
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (typeof value === 'number') out.set(key, value)
    }
  }
  return out
}

/** What a transform key means when nothing sets it. */
function identity(key: string): number {
  return key.startsWith('scale') ? 1 : 0
}

export interface HozoAnimatedProps {
  style?: StyleProp<ViewStyle>
  hozoTransition?: HozoTransitionSpec
  children?: ReactNode
  [key: string]: unknown
}

export function HozoAnimated({ style, hozoTransition, children, ...props }: HozoAnimatedProps) {
  const flat = useMemo(() => StyleSheet.flatten(style) ?? {}, [style])

  // One progress value per animation rather than one per property. The
  // properties change together -- they are the same rule flipping -- so
  // animating a single 0 → 1 and interpolating each property from its old
  // value to its new one is both cheaper and impossible to get out of
  // step with itself.
  const progress = useRef(new Animated.Value(1)).current
  const from = useRef<ViewStyle>(flat)
  const to = useRef<ViewStyle>(flat)

  // What changed, computed during render so the effect below has nothing
  // to work out. `JSON.stringify` on the two style objects is enough: they
  // are flat, their values are primitives, and the compiler emits the keys
  // in a stable order.
  const signature = JSON.stringify(flat)
  const previous = useRef(signature)
  if (previous.current !== signature) {
    // The *visible* style becomes the new starting point, not the
    // previous target. Interrupting a half-finished fade and restarting
    // from where it was going would make it jump backwards first.
    from.current = to.current
    to.current = flat
    previous.current = signature
  }

  useEffect(() => {
    if (!hozoTransition) return
    progress.setValue(0)
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: hozoTransition.duration,
      easing: easingFor(hozoTransition.easing),
      // Colours are in here too, and React Native cannot interpolate one
      // on the native driver. One animation on the JavaScript driver is
      // the honest choice: two drivers running the same rule would drift
      // against each other on a busy frame, and a background that arrives
      // before the text that sits on it is worse than both arriving late.
      useNativeDriver: false,
    })
    animation.start()
    return () => animation.stop()
  }, [progress, signature, hozoTransition])

  const animated = useMemo(() => {
    if (!hozoTransition) return flat
    const overrides: Record<string, unknown> = {}

    if (typeof from.current.opacity === 'number' || typeof flat.opacity === 'number') {
      const start = typeof from.current.opacity === 'number' ? from.current.opacity : 1
      const end = typeof flat.opacity === 'number' ? flat.opacity : 1
      if (start !== end) {
        overrides.opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [start, end] })
      }
    }

    for (const key of COLOR_KEYS) {
      // Read through a record: `color` lives on `TextStyle` and the rest
      // on `ViewStyle`, and a component that may be either has to look at
      // both. The runtime check below is what makes it safe.
      const start = (from.current as Record<string, unknown>)[key]
      const end = (flat as Record<string, unknown>)[key]
      if (typeof start !== 'string' || typeof end !== 'string' || start === end) continue
      overrides[key] = progress.interpolate({ inputRange: [0, 1], outputRange: [start, end] })
    }

    const before = transformMap(from.current)
    const after = transformMap(flat)
    const keys = [...new Set([...before.keys(), ...after.keys()])]
    const moved = keys.filter(
      (key) => (before.get(key) ?? identity(key)) !== (after.get(key) ?? identity(key)),
    )
    if (moved.length > 0) {
      // Every key, not only the moved ones: `transform` is replaced
      // wholesale, so leaving one out would reset it to identity halfway
      // through the animation of its neighbour.
      overrides.transform = keys.map((key) => ({
        [key]: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [before.get(key) ?? identity(key), after.get(key) ?? identity(key)],
        }),
      }))
    }

    return [flat, overrides]
  }, [flat, hozoTransition, progress, signature])

  return (
    <Animated.View style={animated as StyleProp<ViewStyle>} {...props}>
      {children}
    </Animated.View>
  )
}

function easingFor(name: HozoTransitionSpec['easing']) {
  // Built here rather than in a module-level table, for the reason
  // `hooks.native.ts` does the same: a table calls `Easing.bezier` on
  // import, for every project that loads the package and never
  // transitions. The import itself is free; the call is not.
  switch (name) {
    case 'linear':
      return Easing.linear
    case 'ease-in':
      return Easing.bezier(0.4, 0, 1, 1)
    case 'ease-out':
      return Easing.bezier(0, 0, 0.2, 1)
    default:
      return Easing.bezier(0.4, 0, 0.2, 1)
  }
}
