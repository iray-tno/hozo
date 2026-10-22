import { blendColor } from '@hozo/engine'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing } from 'react-native'
import type { HozoTransition } from './pressable.native.tsx'

type Spec = Pick<HozoTransition, 'duration' | 'delay' | 'easing'>

function easingFor(name: Spec['easing']) {
  switch (name) {
    case 'linear':
      return Easing.linear
    case 'ease-in':
      return Easing.in(Easing.ease)
    case 'ease-out':
      return Easing.out(Easing.ease)
    case 'ease-in-out':
      return Easing.inOut(Easing.ease)
  }
}

/**
 * One colour timeline, reusable by a leaf or an inherited label owner.
 * Progress is not reset when retargeting: the new interpolation starts at the
 * observed position. Resetting a live value to zero would briefly send the
 * previous interpolation back to its old starting colour.
 */
export function useHozoTextColorTransition(
  target: string | undefined,
  revision: string,
  spec: Spec,
) {
  const [progress] = useState(() => new Animated.Value(0))
  const position = useRef(0)
  const animation = useRef<Animated.CompositeAnimation | null>(null)
  const [range, setRange] = useState(() => ({
    from: target ?? '',
    to: target ?? '',
    target,
    revision,
    start: 0,
    animate: false,
  }))
  useLayoutEffect(() => {
    const listener = progress.addListener(({ value }) => {
      position.current = value
    })
    return () => {
      progress.removeListener(listener)
      animation.current?.stop()
    }
  }, [progress])
  useLayoutEffect(() => {
    if (range.target === target && range.revision === revision) return
    animation.current?.stop()
    const start = position.current
    const fraction = Math.max(0, Math.min(1, start - range.start))
    const current = range.from ? blendColor(range.from, range.to, fraction) : (target ?? '')
    // Only committed inputs may replace the range. An abandoned Suspense
    // render must not consume the target or mutate the visible timeline.
    setRange({
      from: target ? current : '',
      to: target ?? '',
      target,
      revision,
      start,
      animate: Boolean(target),
    })
  }, [range, target, revision])
  const { duration, delay = 0, easing } = spec
  useLayoutEffect(() => {
    if (!range.animate) return
    const next = Animated.timing(progress, {
      toValue: range.start + 1,
      duration,
      delay,
      easing: easingFor(easing),
      useNativeDriver: false,
    })
    animation.current = next
    next.start()
    return () => {
      next.stop()
      if (animation.current === next) animation.current = null
    }
  }, [progress, range, duration, delay, easing])
  return useMemo(
    () =>
      range.from
        ? progress.interpolate({
            inputRange: [range.start, range.start + 1],
            outputRange: [range.from, range.to],
          })
        : undefined,
    [progress, range],
  )
}
