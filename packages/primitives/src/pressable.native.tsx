import {
  HozoInteractionContext,
  usePressableInteraction,
} from '@hozo/behaviors/pressable-interaction'
import { blendColor } from '@hozo/engine'
import {
  Children,
  type Context,
  cloneElement,
  createContext,
  type ElementType,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Animated,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import { nativeDisabledProps } from './native-disabled.ts'
import { HozoPeerContext } from './peer-context.native.ts'
import { easingFor, useHozoTextColorTransition } from './text-color-transition.native.ts'

export interface HozoTransition {
  duration: number
  delay?: number
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  opacity: boolean
  transform: boolean
  colors: boolean
}

export interface HozoPressableState extends PressableStateCallbackType {
  hovered: boolean
  focused: boolean
  focusVisible: boolean
}

export interface HozoPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: HozoPressableState) => StyleProp<ViewStyle>)
  hozoTransition?: HozoTransition
  /** Enables per-element pointer/keyboard modality inference. */
  hozoFocusVisible?: boolean
  /** Channel ID inside an enclosing `HozoPeerScope` when a following sibling uses interactive `peer-*`. */
  hozoPeerId?: number
  /**
   * The text styles this element's class list carries for its label, by
   * state -- what a `<button>` passes to its text on the Web (#876). The
   * compiler writes it when the label is not in the source it can see, so
   * it arrives as `children` and is styled here: a string is put in a
   * `Text`, and a direct `Text` child has these merged ahead of its own.
   * A `Text` deeper inside is not reached (#950).
   */
  hozoTextStyle?: (state: HozoPressableState) => StyleProp<TextStyle>
}

/** A component a label can be: React Native's `Text`, `HozoText`, or one marked so. */
function isLabelText(child: ReactElement): boolean {
  const type = child.type as { hozoLabelText?: boolean } | string
  return (
    type === Text || type === HozoText || (typeof type !== 'string' && type?.hozoLabelText === true)
  )
}

/** `children` with `label` handed to the text among them, one level deep. */
function withLabelStyle(children: ReactNode, label: StyleProp<TextStyle>): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return <Text style={label}>{child}</Text>
    }
    if (!isValidElement<{ style?: unknown }>(child) || !isLabelText(child)) return child
    const own = child.props.style
    return cloneElement(child, {
      style:
        typeof own === 'function'
          ? (state: HozoPressableState) => [
              label,
              (own as (s: HozoPressableState) => unknown)(state),
            ]
          : [label, own],
    } as { style: unknown })
  })
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Which Pressable to render, and it is not a preference.
 *
 * `Animated.createAnimatedComponent` drops a *function* style. React
 * Native's `AnimatedProps.__getValueWithStaticProps` flattens the static
 * style before handing it on:
 *
 *     const flatStaticStyle = flattenStyle(staticStyle);
 *     ...
 *     } else { props[key] = flatStaticStyle; }
 *
 * and `flattenStyle` of a function is `undefined`, so the element renders
 * with no style at all -- no background, no padding, nothing. A compiled
 * `hover:` class produces exactly that callback, so every Pressable with a
 * state variant and no transition rendered unstyled on both platforms.
 *
 * Measured rather than reasoned: four probes on the census screen, each
 * adding one ingredient, and the one that lost its colour was the callback
 * without a transition (#357). #334 had already fixed the transition half
 * by passing an array, which is why that half draws.
 *
 * So an element with nothing to animate gets the plain Pressable, which
 * takes a callback as its own API and keeps React Native's timing for
 * `pressed` with it.
 */
// Annotated because the inferred type of the animated component names an
// internal React Native type that cannot be referenced from a declaration
// file. `ElementType` says the only thing the caller needs: it is a
// component to render.
export function pressableFor(transition: HozoTransition | undefined): ElementType {
  return transition ? AnimatedPressable : Pressable
}
const AnimatedText = Animated.createAnimatedComponent(Text)
type InteractionContextValue = HozoPressableState & { transition?: HozoTransition }
// Shared with `@hozo/patterns`' pressable, which provides it too (#974).
const InteractionContext = HozoInteractionContext as Context<InteractionContextValue | null>
type AnimationDriver = { current: ((state: HozoPressableState) => void) | null }
const AnimationDriverContext = createContext<AnimationDriver | null>(null)

function chain<E>(own: () => void, caller?: ((event: E) => void) | null) {
  return (event: E) => {
    own()
    caller?.(event)
  }
}

const IDLE: HozoPressableState = {
  pressed: false,
  hovered: false,
  focused: false,
  focusVisible: false,
}

function transitionTiming(
  value: Animated.Value,
  toValue: number,
  transition: HozoTransition,
  useNativeDriver: boolean,
) {
  return Animated.timing(value, {
    toValue,
    duration: transition.duration,
    delay: transition.delay ?? 0,
    easing: easingFor(transition.easing),
    useNativeDriver,
  })
}

type TransformTarget = { key: string; value: number; degrees: boolean }
const transformRank = (key: string) =>
  key.startsWith('translate') ? 0 : key.startsWith('rotate') ? 1 : 2

// Both motion probes need the full Cartesian product, in the same order.
// Called only by the transition child, never by a plain Pressable.
function interactionStates(): HozoPressableState[] {
  return Array.from({ length: 16 }, (_, bits) => ({
    pressed: !!(bits & 8),
    hovered: !!(bits & 4),
    focused: !!(bits & 2),
    focusVisible: !!(bits & 1),
  }))
}

function transformTargets(style: StyleProp<ViewStyle>): TransformTarget[] {
  const merged = new Map<string, TransformTarget>()
  const visit = (part: StyleProp<ViewStyle>) => {
    if (!part) return
    if (Array.isArray(part)) return part.forEach(visit)
    const transform = StyleSheet.flatten(part)?.transform
    // React Native also accepts a CSS transform string, which has no
    // entries to read. Nothing here can animate one, and the `as any[]`
    // that used to stand here let it reach `Object.entries` and come back
    // with a key of `'0'`.
    if (typeof transform === 'string') return
    for (const entry of transform || []) {
      const pair = Object.entries(entry as Record<string, unknown>)[0]
      if (!pair) continue
      const key = pair[0]
      const raw = pair[1]
      if (key === 'scale' && typeof raw === 'number') {
        merged.set('scaleX', { key: 'scaleX', value: raw, degrees: false })
        merged.set('scaleY', { key: 'scaleY', value: raw, degrees: false })
      } else if (typeof raw === 'number') {
        merged.set(key, { key, value: raw, degrees: false })
      } else if (typeof raw === 'string' && raw.endsWith('deg')) {
        const value = Number(raw.slice(0, -3))
        if (Number.isFinite(value)) merged.set(key, { key, value, degrees: true })
      }
    }
  }
  visit(style)
  return [...merged.values()].sort((a, b) => transformRank(a.key) - transformRank(b.key))
}

function identityFor(target: TransformTarget) {
  return target.key.startsWith('scale') ? 1 : 0
}

const COLOR_KEYS = ['backgroundColor', 'color'] as const
type ColorKey = (typeof COLOR_KEYS)[number]
type ColorRange = { from: string; to: string }

function transformMap(style: StyleProp<ViewStyle>) {
  return new Map(transformTargets(style).map((t) => [t.key, t.value]))
}

function targetOpacityOf(style: StyleProp<ViewStyle>): number {
  const value = StyleSheet.flatten(style)?.opacity
  return typeof value === 'number' ? value : 1
}

function colorTargets(style: StyleProp<ViewStyle>) {
  const flattened = StyleSheet.flatten(style) as Record<string, unknown> | undefined
  const colors = new Map<ColorKey, string>()
  for (const key of COLOR_KEYS) {
    const value = flattened?.[key]
    if (typeof value === 'string') colors.set(key, value)
  }
  return colors
}

export function HozoPressable({
  style,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  onPressIn,
  onPressOut,
  onPointerDown,
  onKeyDown,
  hozoTransition,
  hozoFocusVisible = false,
  hozoPeerId,
  hozoTextStyle,
  children,
  ...props
}: HozoPressableProps) {
  props = nativeDisabledProps(props)
  // Keep the event/context owner mounted when motion is added or removed.
  // Only the optional animation child owns nodes and progress listeners.
  const driver = useRef<((state: HozoPressableState) => void) | null>(null)
  const animate = useCallback((state: HozoPressableState) => driver.current?.(state), [])
  const { state: interaction, handlers } = usePressableInteraction({
    focusVisible: hozoFocusVisible,
    onChange: hozoTransition ? animate : undefined,
  })
  const peerStore = useContext(HozoPeerContext)
  useLayoutEffect(() => {
    if (peerStore && hozoPeerId !== undefined) {
      peerStore.publish(hozoPeerId, interaction)
    }
  }, [peerStore, hozoPeerId, interaction])
  useLayoutEffect(() => {
    if (!peerStore || hozoPeerId === undefined) return
    return () => peerStore.clear(hozoPeerId)
  }, [peerStore, hozoPeerId])
  const context = useMemo(
    () => ({ ...interaction, transition: hozoTransition }),
    [hozoTransition, interaction],
  )
  // Resolve the owner's snapshot once, not once again inside RN's host.
  // RN's pressed flag can disagree with the owner snapshot. Active wins,
  // as before; only that case needs a separate style evaluation.
  const restingLook = useMemo(
    () => (hozoTransition ? undefined : typeof style === 'function' ? style(interaction) : style),
    [hozoTransition, interaction, style],
  )
  // Assemble native props once, with no trailing conditional spread on the
  // hot no-motion path. Private animation data never goes through RN props.
  const Component: ElementType = hozoTransition ? TransitionPressable : Pressable
  // The label's styles for the state this element is in; children given
  // as a function of React Native's own press state get them too.
  const label = hozoTextStyle?.(interaction)
  const labelled =
    hozoTextStyle === undefined
      ? children
      : typeof children === 'function'
        ? (state: PressableStateCallbackType) =>
            withLabelStyle((children as (s: PressableStateCallbackType) => ReactNode)(state), label)
        : withLabelStyle(children, label)
  const host = (
    <Component
      {...props}
      // biome-ignore lint/correctness/noChildrenProp: a function child is React Native's own form
      children={labelled}
      onHoverIn={chain(handlers.hoverIn, onHoverIn)}
      onHoverOut={chain(handlers.hoverOut, onHoverOut)}
      onFocus={chain(handlers.focus, onFocus)}
      onBlur={chain(handlers.blur, onBlur)}
      onPointerDown={hozoFocusVisible ? chain(handlers.pointerDown, onPointerDown) : onPointerDown}
      onKeyDown={hozoFocusVisible ? chain(handlers.keyDown, onKeyDown) : onKeyDown}
      onPressIn={chain(handlers.pressIn, onPressIn)}
      onPressOut={chain(handlers.pressOut, onPressOut)}
      style={
        hozoTransition
          ? style
          : ({ pressed }: PressableStateCallbackType) =>
              pressed && !interaction.pressed && typeof style === 'function'
                ? style({ ...interaction, pressed: pressed || interaction.pressed })
                : restingLook
      }
    />
  )
  return (
    <InteractionContext.Provider value={context}>
      {hozoTransition ? (
        <AnimationDriverContext.Provider value={driver}>{host}</AnimationDriverContext.Provider>
      ) : (
        host
      )}
    </InteractionContext.Provider>
  )
}

function TransitionPressable({
  style,
  ...props
}: Omit<HozoPressableProps, 'hozoFocusVisible' | 'hozoTransition'>) {
  // This private owner is mounted only inside both providers, for motion.
  const { pressed, hovered, focused, focusVisible, transition } = useContext(InteractionContext)!
  const hozoTransition = transition!
  const interaction = useMemo(
    () => ({ pressed, hovered, focused, focusVisible }),
    [pressed, hovered, focused, focusVisible],
  )
  const driver = useContext(AnimationDriverContext)!
  const resolvedStyle = useMemo(
    () => (typeof style === 'function' ? style(interaction) : style),
    [interaction, style],
  )
  const colorSpecs = useMemo(() => {
    if (!hozoTransition.colors) return [] as ColorKey[]
    if (typeof style !== 'function') return [...colorTargets(style).keys()]
    const found = new Set<ColorKey>()
    for (const state of interactionStates())
      for (const key of colorTargets(style(state)).keys()) found.add(key)
    return [...found]
  }, [hozoTransition.colors, style])
  const transformSpecs = useMemo(() => {
    if (!hozoTransition.transform) return [] as TransformTarget[]
    if (typeof style !== 'function') return transformTargets(style)
    const merged = new Map<string, TransformTarget>()
    for (const state of interactionStates())
      for (const target of transformTargets(style(state))) merged.set(target.key, target)
    return [...merged.values()].sort((a, b) => transformRank(a.key) - transformRank(b.key))
  }, [hozoTransition.transform, style])
  const motion = useState(() => {
    const op = targetOpacityOf(resolvedStyle)
    const initColors = colorTargets(resolvedStyle)
    const ranges = new Map<ColorKey, ColorRange>()
    for (const key of colorSpecs) {
      const v = initColors.get(key) ?? (key === 'backgroundColor' ? 'transparent' : '')
      if (v) ranges.set(key, { from: v, to: v })
    }
    const transforms = new Map<string, { value: Animated.Value; last: number }>()
    const initT = transformMap(resolvedStyle)
    for (const spec of transformSpecs) {
      const v = initT.get(spec.key) ?? identityFor(spec)
      transforms.set(spec.key, { value: new Animated.Value(v), last: v })
    }
    return {
      opacity: new Animated.Value(op),
      lastOpacity: op,
      colorProgress: new Animated.Value(0),
      colorPos: 0,
      colorStart: 0,
      ranges,
      transforms,
      animation: null as Animated.CompositeAnimation | null,
    }
  })[0]
  const setRevision = useState(0)[1]

  useLayoutEffect(() => {
    const listener = motion.colorProgress.addListener(({ value }) => {
      motion.colorPos = value
    })
    return () => {
      motion.colorProgress.removeListener(listener)
      motion.animation?.stop()
    }
  }, [motion])

  // Install only the committed driver and keep animated channels synced with
  // prop/theme style changes (#2273) without mutating during speculative renders.
  useLayoutEffect(() => {
    const syncStyle = (targetStyle: StyleProp<ViewStyle>, syncRender: boolean) => {
      const animations: Animated.CompositeAnimation[] = []
      let needsRender = false
      if (hozoTransition.opacity) {
        const target = targetOpacityOf(targetStyle)
        if (target !== motion.lastOpacity) {
          motion.lastOpacity = target
          animations.push(transitionTiming(motion.opacity, target, hozoTransition, true))
        }
      }
      if (hozoTransition.transform) {
        const targets = transformMap(targetStyle)
        for (const spec of transformSpecs) {
          const id = identityFor(spec)
          let entry = motion.transforms.get(spec.key)
          if (!entry) {
            entry = { value: new Animated.Value(id), last: id }
            motion.transforms.set(spec.key, entry)
            needsRender = true
          }
          const target = targets.get(spec.key) ?? id
          if (target !== entry.last) {
            entry.last = target
            animations.push(transitionTiming(entry.value, target, hozoTransition, true))
          }
        }
      }
      if (hozoTransition.colors) {
        const targets = colorTargets(targetStyle)
        const start = motion.colorPos
        const f = Math.max(0, Math.min(1, start - motion.colorStart))
        let changed = false
        const nextRanges = new Map<ColorKey, ColorRange>()
        for (const key of COLOR_KEYS) {
          const prev = motion.ranges.get(key)
          const raw = targets.get(key)
          if (!prev && raw === undefined) continue
          const fb = key === 'backgroundColor' ? 'transparent' : ''
          const cur = prev
            ? f <= 0
              ? prev.from
              : f >= 1
                ? prev.to
                : blendColor(prev.from, prev.to, f)
            : fb || raw || ''
          const prevTo = prev?.to ?? (fb || cur)
          const to = raw ?? (fb || prevTo)
          if (to !== prevTo) changed = true
          if (cur || to) nextRanges.set(key, { from: cur || to, to: to || cur })
        }
        if (changed) {
          motion.colorStart = start
          motion.ranges = nextRanges
          animations.push(transitionTiming(motion.colorProgress, start + 1, hozoTransition, false))
          needsRender = true
        }
      }
      if (animations.length > 0) {
        motion.animation?.stop()
        motion.animation = Animated.parallel(animations)
        motion.animation.start()
      }
      if (needsRender && syncRender) setRevision((n) => n + 1)
    }
    const run = (next: HozoPressableState) => {
      if (typeof style === 'function') syncStyle(style(next), false)
    }
    driver.current = run
    syncStyle(resolvedStyle, true)
    return () => {
      if (driver.current === run) driver.current = null
    }
  }, [driver, hozoTransition, motion, resolvedStyle, style, transformSpecs])

  const animatedColors: Record<string, unknown> = {}
  motion.ranges.forEach((range, key) => {
    animatedColors[key] = motion.colorProgress.interpolate({
      inputRange: [motion.colorStart, motion.colorStart + 1],
      outputRange: [range.from, range.to],
    })
  })
  const animatedTransform: Record<string, unknown>[] = []
  for (const spec of transformSpecs) {
    const entry = motion.transforms.get(spec.key)
    if (entry) {
      animatedTransform.push({
        [spec.key]: spec.degrees
          ? entry.value.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] })
          : entry.value,
      })
    }
  }
  const PressableComponent = pressableFor(hozoTransition)

  return (
    <PressableComponent
      {...props}
      // An array when there is a transition, a callback when there is
      // not, and the difference is not a preference.
      //
      // `AnimatedProps` builds the animated node from `props.style`, and
      // its first act is to skip anything that is not an object:
      //
      //     if (key === 'style') {
      //       // Ignore `style` if it is not an object (or array).
      //       if (typeof value === 'object' && value != null) {
      //
      // A callback is a function, so no node was ever attached. Pressable
      // still called it, so the `Animated.Value`s it returned reached the
      // view as plain objects where colours and numbers belong -- and a
      // `backgroundColor` that is an object is not a colour, so the view
      // dropped it. The compiled `bg-brand` button rendered with no
      // background at all, and its white label with it, for as long as
      // this code has existed. Found by the first screenshot anything
      // ever took of the acceptance screen (#297).
      //
      // The state the callback would have supplied is state the enclosing
      // event owner already keeps: `pressed` is set from `onPressIn` and
      // `onPressOut`, which is what drives Pressable's own flag too.
      style={
        // Cast because `Animated.createAnimatedComponent` types
        // `style` as a resolved ViewStyle, while the whole point of
        // an animated component is that it may hold `Animated.Value`s.
        [
          resolvedStyle,
          {
            ...(hozoTransition.opacity ? { opacity: motion.opacity } : null),
            ...(hozoTransition.transform ? { transform: animatedTransform } : null),
            ...(hozoTransition.colors ? animatedColors : null),
          },
        ] as unknown as StyleProp<ViewStyle>
      }
    />
  )
}

export interface HozoTextProps extends Omit<TextProps, 'style'> {
  children?: ReactNode
  style?: StyleProp<TextStyle> | ((state: HozoPressableState) => StyleProp<TextStyle>)
}

/** Text whose interaction state and transition are owned by an enclosing HozoPressable. */
export function HozoText({ style, ...props }: HozoTextProps) {
  // Public Text is valid outside an owner. Dependency arrays run before
  // early returns, so the former shared component's context.transition
  // dependency threw there. Keep the nullable gate here; the motion child
  // mounts only with a real owner and an enabled colour transition.
  const context = useContext(InteractionContext)
  const resolved = typeof style === 'function' ? style(context ?? IDLE) : style
  if (!context?.transition?.colors || typeof style !== 'function') {
    return <Text {...props} style={resolved} />
  }
  return <TransitionText {...props} context={context} resolved={resolved} />
}

export interface HozoInteractionViewProps extends Omit<ViewProps, 'style'> {
  children?: ReactNode
  style?: StyleProp<ViewStyle> | ((state: HozoPressableState) => StyleProp<ViewStyle>)
}

/**
 * A View whose `group-*:` styles read the state of an enclosing
 * HozoPressable, as HozoText's do. Without it a `group` card could restyle
 * its label but not the icon box beside it. The style switches; it does not
 * animate, since a `transition-*` on the owner animates the owner and its
 * text colour only.
 */
export function HozoInteractionView({ style, ...props }: HozoInteractionViewProps) {
  const context = useContext(InteractionContext)
  return <View {...props} style={typeof style === 'function' ? style(context ?? IDLE) : style} />
}

function TransitionText({
  context,
  resolved,
  ...props
}: Omit<HozoTextProps, 'style'> & {
  context: InteractionContextValue
  resolved: StyleProp<TextStyle>
}) {
  const target = StyleSheet.flatten(resolved)?.color
  const animatedColor = useHozoTextColorTransition(
    typeof target === 'string' ? target : undefined,
    `${context.pressed}:${context.hovered}:${context.focused}:${context.focusVisible}`,
    context.transition!,
  )
  return (
    <AnimatedText {...props} style={[resolved, animatedColor ? { color: animatedColor } : null]} />
  )
}
