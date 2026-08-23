// Ambient conditions: the ones whose value is the same for the whole app
// at any moment -- colour scheme and viewport width.
//
// These are what make `dark:` and `md:` workable on React Native without
// the reactive engine Hozo deliberately doesn't ship. They aren't
// per-element state, so a single module-level subscription serves every
// component; each one only needs React to re-render it when the value
// changes, which is what `useSyncExternalStore` is for.
//
// Why not RN's own `useColorScheme()` / `useWindowDimensions()`: those
// subscribe *per component*. A list of 200 rows using `md:` would open 200
// subscriptions and re-render all 200 on every dimension event -- and on
// Android those fire on keyboard show/hide, not just rotation. Here there
// is one subscription, and the snapshot is a coarse string, so React's
// `Object.is` bail-out means a resize that doesn't cross a breakpoint
// re-renders nothing at all.
//
// This module is deliberately free of `react` and `react-native` imports
// so it can be tested without either. `./hooks.native.ts` is the glue that
// connects it to both.

type Listener = () => void

export interface Store<T> {
  get: () => T
  /** Notifies subscribers only when the value actually changes. */
  set: (next: T) => void
  subscribe: (listener: Listener) => () => void
}

/**
 * `equals` decides what counts as a change, and defaults to `Object.is`.
 *
 * It exists for the snapshots that aren't primitives: `Dimensions` reports
 * a fresh object on every event, so identity comparison would call every
 * event a change -- and on Android those fire on keyboard show/hide, not
 * just rotation. It also matters for `useSyncExternalStore`, which compares
 * snapshots by identity and re-renders whenever they differ.
 */
export function createStore<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Store<T> {
  const listeners = new Set<Listener>()
  let snapshot = initial
  return {
    get: () => snapshot,
    set(next: T) {
      if (equals(next, snapshot)) {
        return
      }
      snapshot = next
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/// Tailwind's default `min-width` breakpoints, widest first. Kept in step
/// with `hozo_ir::Breakpoint`, whose names the compiler emits.
export const BREAKPOINTS = [
  ['2xl', 1536],
  ['xl', 1280],
  ['lg', 1024],
  ['md', 768],
  ['sm', 640],
] as const

export type BreakpointName = (typeof BREAKPOINTS)[number][0]

/**
 * The widest breakpoint `width` satisfies, or `''` below all of them.
 *
 * A single coarse string rather than the raw width, and that is the whole
 * point: it makes the store's change check meaningful. Resizing within one
 * bucket produces an identical snapshot, so nothing re-renders.
 */
export function bucketFor(width: number): BreakpointName | '' {
  for (const [name, min] of BREAKPOINTS) {
    if (width >= min) {
      return name
    }
  }
  return ''
}

/**
 * The window size, as the viewport-relative utilities (`h-screen`) read it.
 *
 * Only the two numbers those need: `Dimensions` also reports `scale` and
 * `fontScale`, and including them would make a text-size change look like a
 * resize.
 */
export interface Viewport {
  width: number
  height: number
}

/** Whether two viewports describe the same window. */
export function sameViewport(a: Viewport, b: Viewport): boolean {
  return a.width === b.width && a.height === b.height
}

/** Whether `bucket` is at least as wide as the `name` breakpoint. */
export function isAtLeast(bucket: BreakpointName | '', name: BreakpointName): boolean {
  if (bucket === '') {
    return false
  }
  // Ascending width is descending index in BREAKPOINTS.
  const indexOf = (want: string) => BREAKPOINTS.findIndex(([n]) => n === want)
  return indexOf(bucket) <= indexOf(name)
}

/**
 * The environment queries React Native can answer.
 *
 * Tailwind's names, because that is what the author wrote and what the
 * generated call carries. The pairs are one fact each -- `motion-safe` is
 * `motion-reduce` negated, `landscape` is `portrait` negated -- so seven
 * queries ride on four subscriptions.
 *
 * `contrast-more`, `contrast-less`, `forced-colors`, `print` and
 * `noscript` are absent on purpose: React Native's nearest to the first
 * two is Android's high-contrast *text* setting, which is a different
 * thing wearing a similar name, and the last three have no meaning on a
 * device at all. Those compile for Web and are reported on Native rather
 * than answered wrongly.
 */
export type EnvironmentQuery =
  | 'motion-reduce'
  | 'motion-safe'
  | 'portrait'
  | 'landscape'
  | 'ltr'
  | 'rtl'
  | 'inverted-colors'

/** The fact behind a query, and whether the query is its negation. */
export const ENVIRONMENT_FACTS: Record<
  EnvironmentQuery,
  { fact: 'reduceMotion' | 'portrait' | 'rtl' | 'invertColors'; negate: boolean }
> = {
  'motion-reduce': { fact: 'reduceMotion', negate: false },
  'motion-safe': { fact: 'reduceMotion', negate: true },
  portrait: { fact: 'portrait', negate: false },
  landscape: { fact: 'portrait', negate: true },
  rtl: { fact: 'rtl', negate: false },
  ltr: { fact: 'rtl', negate: true },
  'inverted-colors': { fact: 'invertColors', negate: false },
}

/**
 * Orientation from a window size, as a coarse fact.
 *
 * Square counts as portrait, which is the same tie-break CSS makes: the
 * media query is `(orientation: portrait)` for `height >= width`.
 *
 * Coarse on purpose, for the reason the breakpoint bucket is: a component
 * using only `portrait:` must not re-render on every resize that does not
 * turn the device over, and on Android those fire on keyboard show/hide.
 */
export function isPortrait(size: { width: number; height: number }): boolean {
  return size.height >= size.width
}
