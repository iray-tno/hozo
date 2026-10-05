// A project's own `@keyframes`, on React Native (decision 007, slice 3).
//
// `useHozoAnimation` runs Tailwind's four loops, whose frames are known in
// advance and written out by hand. This runs frames the compiler read from
// the project: a StyleX `stylex.keyframes(...)`, or a Tailwind theme's
// `--animate-*` and its `@keyframes`. The compiler hands over the frames as
// React Native style objects and the timing as CSS said it; this turns
// them into one progress value, interpolated per property.
//
// What it can move is what `HozoAnimated` can: opacity, the colours, and
// transforms. The compiler leaves out anything else and says so, because a
// width that jumped from frame to frame would be a different animation
// from the one on the Web.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, type EasingFunction } from 'react-native'

export interface HozoKeyframe {
  /** Where the frame sits, 0 to 1: `from`, `50%`, `to`. */
  at: number
  /** The frame as a React Native style. */
  style: {
    opacity?: number
    backgroundColor?: string
    borderColor?: string
    color?: string
    transform?: Record<string, number | string>[]
  }
}

export interface HozoKeyframesSpec {
  frames: HozoKeyframe[]
  /** `animation-duration`, in milliseconds. */
  duration: number
  /** `animation-delay`, in milliseconds. */
  delay?: number
  /** `animation-timing-function`: a keyword, or a cubic-bezier's four numbers. */
  easing?:
    | 'linear'
    | 'ease'
    | 'ease-in'
    | 'ease-out'
    | 'ease-in-out'
    | [number, number, number, number]
  /** `animation-iteration-count`; `-1` is `infinite`. */
  iterations?: number
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both'
}

const COLOR_KEYS = ['backgroundColor', 'borderColor', 'color'] as const

/** What a transform key is when no frame sets it. */
function identity(key: string): number | string {
  if (key.startsWith('scale')) return 1
  if (key.startsWith('rotate') || key.startsWith('skew')) return '0deg'
  return 0
}

function easingFor(easing: HozoKeyframesSpec['easing']): EasingFunction {
  if (Array.isArray(easing)) return Easing.bezier(...easing)
  switch (easing) {
    case 'linear':
      return Easing.linear
    case 'ease-in':
      return Easing.bezier(0.42, 0, 1, 1)
    case 'ease-out':
      return Easing.bezier(0, 0, 0.58, 1)
    case 'ease-in-out':
      return Easing.bezier(0.42, 0, 0.58, 1)
    default:
      // CSS's initial value, and what `animation` means with none written.
      return Easing.bezier(0.25, 0.1, 0.25, 1)
  }
}

/**
 * One property's track: the frames that set it, in order, with the ends
 * filled in where no frame does. CSS fills them from the element's own
 * value; this fills them with the identity, which is the element's own
 * value unless it has an opacity or a transform of its own.
 */
function track<T>(points: { at: number; value: T }[], fill: T | undefined) {
  const sorted = [...points].sort((a, b) => a.at - b.at)
  if (fill !== undefined) {
    if (sorted[0]?.at !== 0) sorted.unshift({ at: 0, value: fill })
    if (sorted[sorted.length - 1]?.at !== 1) sorted.push({ at: 1, value: fill })
  }
  // `interpolate` needs a strictly increasing input range. Two frames at the
  // same point are the later one winning, as in CSS.
  const deduped: typeof sorted = []
  for (const point of sorted) {
    if (deduped.length > 0 && deduped[deduped.length - 1]?.at === point.at) deduped.pop()
    deduped.push(point)
  }
  return deduped
}

type Phase = 'waiting' | 'running' | 'done'

export function useHozoKeyframes(spec: HozoKeyframesSpec) {
  const progress = useRef(new Animated.Value(0)).current
  const [phase, setPhase] = useState<Phase>(spec.delay ? 'waiting' : 'running')
  const signature = JSON.stringify(spec)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` is the spec, compared by value
  useEffect(() => {
    const iterations = spec.iterations ?? 1
    const direction = spec.direction ?? 'normal'
    const reversed = direction === 'reverse' || direction === 'alternate-reverse'
    const alternates = direction === 'alternate' || direction === 'alternate-reverse'
    const colours = spec.frames.some((frame) =>
      COLOR_KEYS.some((key) => frame.style[key] !== undefined),
    )
    const leg = (toValue: number) =>
      Animated.timing(progress, {
        toValue,
        duration: spec.duration,
        easing: easingFor(spec.easing),
        // React Native cannot interpolate a colour on the native driver.
        useNativeDriver: !colours,
      })

    let animation: Animated.CompositeAnimation
    if (alternates) {
      const forth = leg(reversed ? 0 : 1)
      const back = leg(reversed ? 1 : 0)
      animation =
        iterations < 0
          ? Animated.loop(Animated.sequence([forth, back]))
          : Animated.sequence(
              Array.from({ length: iterations }, (_, i) => leg((i % 2 === 0) !== reversed ? 1 : 0)),
            )
    } else {
      animation = Animated.loop(leg(reversed ? 0 : 1), {
        iterations: iterations < 0 ? -1 : iterations,
      })
    }

    progress.setValue(reversed ? 1 : 0)
    let timer: ReturnType<typeof setTimeout> | undefined
    const start = () => {
      setPhase('running')
      animation.start(({ finished }) => {
        if (finished) setPhase('done')
      })
    }
    if (spec.delay) {
      setPhase('waiting')
      timer = setTimeout(start, spec.delay)
    } else {
      start()
    }
    return () => {
      clearTimeout(timer)
      animation.stop()
    }
  }, [progress, signature])

  // biome-ignore lint/correctness/useExhaustiveDependencies: as above
  const animated = useMemo(() => {
    const style: Record<string, unknown> = {}
    const range = (points: { at: number; value: number | string }[]) => ({
      inputRange: points.map((point) => point.at),
      // Numbers or unit strings, never mixed: the compiler writes one track in
      // one unit. The cast is to the overload; the runtime takes either.
      outputRange: points.map((point) => point.value) as unknown as string[],
    })

    const opacity = spec.frames.flatMap((frame) =>
      frame.style.opacity === undefined ? [] : [{ at: frame.at, value: frame.style.opacity }],
    )
    if (opacity.length > 0) {
      style.opacity = progress.interpolate(range(track(opacity, 1)))
    }

    for (const key of COLOR_KEYS) {
      const points = spec.frames.flatMap((frame) =>
        frame.style[key] === undefined ? [] : [{ at: frame.at, value: frame.style[key] as string }],
      )
      // No identity for a colour: the ends hold the nearest frame.
      if (points.length > 0) style[key] = progress.interpolate(range(track(points, undefined)))
    }

    const keys: string[] = []
    for (const frame of spec.frames) {
      for (const entry of frame.style.transform ?? []) {
        for (const key of Object.keys(entry)) if (!keys.includes(key)) keys.push(key)
      }
    }
    if (keys.length > 0) {
      style.transform = keys.map((key) => {
        const points = spec.frames.flatMap((frame) => {
          const entry = frame.style.transform?.find((candidate) => key in candidate)
          return entry ? [{ at: frame.at, value: entry[key] as number | string }] : []
        })
        return { [key]: progress.interpolate(range(track(points, identity(key)))) }
      })
    }
    return style
  }, [progress, signature])

  // Outside the animation's run, CSS shows the element's own style unless
  // the fill mode says otherwise: `backwards` holds the first frame through
  // the delay, `forwards` the last after the end.
  const fill = spec.fillMode ?? 'none'
  if (phase === 'waiting' && fill !== 'backwards' && fill !== 'both') return null
  if (phase === 'done' && fill !== 'forwards' && fill !== 'both') return null
  return animated
}
