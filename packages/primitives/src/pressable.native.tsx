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
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  type MouseEvent,
  type NativeSyntheticEvent,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  StyleSheet,
  type TargetedEvent,
  Text,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useHozoTextColorTransition } from './text-color-transition.native.ts'

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

function easingFor(name: HozoTransition['easing']) {
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
      const [key, raw] = Object.entries(entry as Record<string, unknown>)[0] || []
      if (!key) continue
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
  hozoTextStyle,
  children,
  ...props
}: HozoPressableProps) {
  // Keep the event/context owner mounted when motion is added or removed.
  // Only the optional animation child owns nodes and progress listeners.
  const driver = useRef<((state: HozoPressableState) => void) | null>(null)
  const animate = useCallback((state: HozoPressableState) => driver.current?.(state), [])
  const { state: interaction, handlers } = usePressableInteraction({
    focusVisible: hozoFocusVisible,
    onChange: hozoTransition ? animate : undefined,
  })
  const context = useMemo(
    () => ({ ...interaction, transition: hozoTransition }),
    [hozoTransition, interaction],
  )
  // Resolve the owner's snapshot once, not once again inside RN's host.
  // RN's pressed flag can disagree with the owner snapshot. Active wins,
  // as before; only that case needs a separate style evaluation.
  const restingLook = useMemo(
    () =>
      hozoTransition ? undefined : typeof style === 'function' ? style({ ...interaction }) : style,
    [hozoTransition, interaction, style],
  )
  // Assemble native props once, with no trailing conditional spread on the
  // hot no-motion path. Private animation data never goes through RN props.
  const Component: ElementType = hozoTransition ? TransitionPressable : Pressable
  // The label's styles for the state this element is in; children given
  // as a function of React Native's own press state get them too.
  const label = hozoTextStyle?.({ ...interaction })
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
      onHoverIn={(event: MouseEvent) => {
        handlers.hoverIn()
        onHoverIn?.(event)
      }}
      onHoverOut={(event: MouseEvent) => {
        handlers.hoverOut()
        onHoverOut?.(event)
      }}
      onFocus={(event: NativeSyntheticEvent<TargetedEvent>) => {
        handlers.focus()
        onFocus?.(event)
      }}
      onBlur={(event: NativeSyntheticEvent<TargetedEvent>) => {
        handlers.blur()
        onBlur?.(event)
      }}
      onPointerDown={
        hozoFocusVisible
          ? (event: Parameters<NonNullable<PressableProps['onPointerDown']>>[0]) => {
              handlers.pointerDown()
              onPointerDown?.(event)
            }
          : onPointerDown
      }
      onKeyDown={
        hozoFocusVisible
          ? (event: Parameters<NonNullable<PressableProps['onKeyDown']>>[0]) => {
              handlers.keyDown()
              onKeyDown?.(event)
            }
          : onKeyDown
      }
      onPressIn={(event: GestureResponderEvent) => {
        handlers.pressIn()
        onPressIn?.(event)
      }}
      onPressOut={(event: GestureResponderEvent) => {
        handlers.pressOut()
        onPressOut?.(event)
      }}
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
  const context = useContext(InteractionContext)!
  const hozoTransition = context.transition!
  const interaction = useMemo(
    () => ({
      pressed: context.pressed,
      hovered: context.hovered,
      focused: context.focused,
      focusVisible: context.focusVisible,
    }),
    [context.pressed, context.hovered, context.focused, context.focusVisible],
  )
  const driver = useContext(AnimationDriverContext)!
  const initialStyle = typeof style === 'function' ? style({ ...interaction }) : style
  const initialOpacity = StyleSheet.flatten(initialStyle)?.opacity
  const opacity = useRef(
    new Animated.Value(typeof initialOpacity === 'number' ? initialOpacity : 1),
  ).current
  const colorSpecs = useMemo(() => {
    if (!hozoTransition.colors || typeof style !== 'function') return [] as ColorKey[]
    const found = new Set<ColorKey>()
    for (const state of interactionStates())
      for (const key of colorTargets(style(state)).keys()) found.add(key)
    return [...found]
  }, [hozoTransition.colors, style])
  const initialColors = colorTargets(initialStyle)
  const colorRanges = useRef(new Map<ColorKey, ColorRange>()).current
  for (const key of colorSpecs) {
    if (!colorRanges.has(key)) {
      const initial = initialColors.get(key) ?? (key === 'backgroundColor' ? 'transparent' : '')
      if (initial) colorRanges.set(key, { from: initial, to: initial })
    }
  }
  const colorProgress = useRef(new Animated.Value(0)).current
  const colorFraction = useRef(0)
  const animation = useRef<Animated.CompositeAnimation | null>(null)
  useEffect(() => {
    const listener = colorProgress.addListener(({ value }) => {
      colorFraction.current = value
    })
    return () => {
      colorProgress.removeListener(listener)
      animation.current?.stop()
    }
  }, [colorProgress])
  const animatedColors = Object.fromEntries(
    [...colorRanges].map(([key, range]) => [
      key,
      colorProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [range.from, range.to],
      }),
    ]),
  )
  const transformSpecs = useMemo(() => {
    if (!hozoTransition.transform || typeof style !== 'function') return []
    const merged = new Map<string, TransformTarget>()
    for (const state of interactionStates()) {
      for (const target of transformTargets(style(state))) merged.set(target.key, target)
    }
    return [...merged.values()].sort((a, b) => transformRank(a.key) - transformRank(b.key))
  }, [hozoTransition.transform, style])
  const transformValues = useRef(new Map<string, Animated.Value>()).current
  const initialTargets = new Map(
    transformTargets(initialStyle).map((target) => [target.key, target]),
  )
  for (const spec of transformSpecs) {
    if (!transformValues.has(spec.key)) {
      transformValues.set(
        spec.key,
        new Animated.Value(initialTargets.get(spec.key)?.value ?? identityFor(spec)),
      )
    }
  }
  const animatedTransform = transformSpecs.map((spec) => ({
    [spec.key]: spec.degrees
      ? transformValues.get(spec.key)!.interpolate({
          inputRange: [-360, 360],
          outputRange: ['-360deg', '360deg'],
        })
      : transformValues.get(spec.key)!,
  }))
  const animateInteraction = useCallback(
    (next: HozoPressableState) => {
      if (typeof style !== 'function') return
      const flattened = StyleSheet.flatten(style({ ...next }))
      const animations: Animated.CompositeAnimation[] = []
      if (hozoTransition.opacity) {
        const targetOpacity = typeof flattened?.opacity === 'number' ? flattened.opacity : 1
        animations.push(transitionTiming(opacity, targetOpacity, hozoTransition, true))
      }
      if (hozoTransition.transform) {
        const targets = new Map(
          transformTargets(style({ ...next })).map((target) => [target.key, target.value]),
        )
        for (const spec of transformSpecs) {
          animations.push(
            transitionTiming(
              transformValues.get(spec.key)!,
              targets.get(spec.key) ?? identityFor(spec),
              hozoTransition,
              true,
            ),
          )
        }
      }
      if (hozoTransition.colors) {
        const targets = colorTargets(style({ ...next }))
        for (const [key, range] of colorRanges) {
          const current = blendColor(range.from, range.to, colorFraction.current)
          const target = targets.get(key) ?? (key === 'backgroundColor' ? 'transparent' : current)
          colorRanges.set(key, { from: current, to: target })
        }
        colorProgress.setValue(0)
        colorFraction.current = 0
        animations.push(transitionTiming(colorProgress, 1, hozoTransition, false))
      }
      animation.current = Animated.parallel(animations)
      animation.current.start()
    },
    [colorProgress, colorRanges, hozoTransition, opacity, style, transformSpecs, transformValues],
  )
  // Install only the committed driver. A speculative render must not replace
  // the callback used synchronously by the parent's event machine.
  useLayoutEffect(() => {
    driver.current = animateInteraction
    return () => {
      if (driver.current === animateInteraction) driver.current = null
    }
  }, [animateInteraction, driver])
  const PressableComponent = pressableFor(hozoTransition)

  // The style for the state this component is in, resolved here because
  // the animated path cannot hand React Native a callback -- see the
  // `style` prop below.
  const resolvedStyle = useMemo(
    () => (typeof style === 'function' ? style({ ...interaction }) : style),
    [interaction, style],
  )

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
            ...(hozoTransition.opacity ? { opacity } : null),
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
  const state = context ?? { pressed: false, hovered: false, focused: false, focusVisible: false }
  const resolved = typeof style === 'function' ? style(state) : style
  if (!context?.transition?.colors || typeof style !== 'function') {
    return <Text {...props} style={resolved} />
  }
  return <TransitionText {...props} context={context} resolved={resolved} />
}

function TransitionText({
  context,
  resolved,
  ...props
}: Omit<HozoTextProps, 'style'> & {
  context: InteractionContextValue
  resolved: StyleProp<TextStyle>
}) {
  const transition = context.transition!
  const state = context
  const target = StyleSheet.flatten(resolved)?.color
  const interaction = `${state.pressed}:${state.hovered}:${state.focused}:${state.focusVisible}`
  const animatedColor = useHozoTextColorTransition(
    typeof target === 'string' ? target : undefined,
    interaction,
    transition,
  )
  return (
    <AnimatedText {...props} style={[resolved, animatedColor ? { color: animatedColor } : null]} />
  )
}
