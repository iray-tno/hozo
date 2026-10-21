// What a View's spread means on the Web, once the compiler has lowered it to
// a plain element -- and a Text's, an Image's, and every document primitive's,
// since they share the same universal props (#1122).
//
// `function Box(props) { return <View {...props} /> }` lowers at build time,
// but `props` still holds the primitive's vocabulary -- `accessibilityLabel`,
// `testID`, `accessibilityState` -- and spread raw onto the DOM those are
// unknown attributes: the element loses its accessible name, and a test that
// finds it by test id finds nothing. #1096 and #1118 were the same bug for
// Button and TextInput.
//
// So the spread goes through the translation the uncompiled `View` applies
// to its named props. Everything else passes through, as it did before:
// `aria-*`, `onKeyDown` and the rest are already DOM props. Keys the spread
// does not hold are not set, because explicit attributes the compiler wrote
// before the spread must survive it.
//
// `onLayout` and the responder props need the element and an effect, which a
// function called during render does not have (#1126). So when the spread
// carries one, the translation adds a callback ref: it is handed the element,
// and the cleanup React 19 runs when the element goes is the effect's.

import {
  createSpreadResponder,
  type HozoDomStyle,
  hozoDomStyle,
  RESPONDER_PROPS,
  type ResponderProps,
} from '@hozo/engine'

type Props = Record<string, unknown>
type State = {
  disabled?: boolean
  selected?: boolean
  checked?: boolean | 'mixed'
  busy?: boolean
  expanded?: boolean
}
type Value = { min?: number; max?: number; now?: number; text?: string }
type Source = string | number | { uri?: string; default?: string } | readonly Source[] | undefined

const UNIVERSAL = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'accessibilityLiveRegion',
  'accessibilityState',
  'accessibilityValue',
  'nativeID',
  'pointerEvents',
  'style',
  'testID',
])

type LayoutEvent = {
  nativeEvent: { layout: { x: number; y: number; width: number; height: number } }
}
type Attached = {
  onLayout?: (event: LayoutEvent) => void
  observer?: ResizeObserver
  previous: string
  // Set by the cleanup, cleared when the element is attached again.
  leaving: boolean
}

// Per element, not per render: the ref is a new function each render, so
// React detaches the old one and attaches the new to the same element. The
// observer survives that, and so does the last layout reported -- as with
// the uncompiled View, `onLayout` fires when the layout changes, not on
// every render.
const attached = new WeakMap<HTMLElement, Attached>()

function observe(element: HTMLElement, state: Attached) {
  const emit = () => {
    const rect = element.getBoundingClientRect()
    const layout = {
      x: element.offsetLeft,
      y: element.offsetTop,
      width: rect.width,
      height: rect.height,
    }
    const key = `${layout.x}:${layout.y}:${layout.width}:${layout.height}`
    if (key === state.previous) return
    state.previous = key
    state.onLayout?.({ nativeEvent: { layout } })
  }
  emit()
  if (typeof ResizeObserver === 'undefined') return
  state.observer = new ResizeObserver(emit)
  state.observer.observe(element)
}

type ElementRef =
  | ((node: HTMLElement | null) => undefined | (() => void))
  | { current: unknown }
  | null
  | undefined

/** The callback ref that gives a translated spread its element, or none when it needs none. */
function elementRef(source: Props):
  | (((node: HTMLElement | null) => (() => void) | undefined) & {
      responder?: ReturnType<typeof createSpreadResponder>
    })
  | undefined {
  const onLayout = source.onLayout as Attached['onLayout']
  const responderProps: ResponderProps = {}
  for (const name of RESPONDER_PROPS) {
    if (Object.hasOwn(source, name)) (responderProps as Props)[name] = source[name]
  }
  const responder =
    Object.keys(responderProps).length > 0 ? createSpreadResponder(responderProps) : undefined
  if (!onLayout && !responder) return undefined
  const forwarded = source.ref as ElementRef
  return Object.assign(
    (node: HTMLElement | null) => {
      if (!node) return undefined
      let state = attached.get(node)
      if (!state) {
        state = { previous: '', leaving: false }
        attached.set(node, state)
      }
      state.leaving = false
      state.onLayout = onLayout
      if (onLayout && !state.observer) observe(node, state)
      responder?.attach(node)
      let release: (() => void) | undefined
      if (typeof forwarded === 'function') release = forwarded(node)
      else if (forwarded) forwarded.current = node
      const current = state
      return () => {
        if (typeof release === 'function') release()
        else if (typeof forwarded === 'function') forwarded(null)
        else if (forwarded) forwarded.current = null
        // Not yet: a re-render detaches and reattaches the same element.
        current.leaving = true
        queueMicrotask(() => {
          if (!current.leaving) return
          current.observer?.disconnect()
          attached.delete(node)
          responder?.release(node)
        })
      }
    },
    { responder },
  )
}

function translate(source: Props, consumed: Set<string>): Props {
  const has = (name: string) => Object.hasOwn(source, name)
  const out: Props = {}
  for (const name in source) {
    if (has(name) && !consumed.has(name)) out[name] = source[name]
  }

  if (has('accessibilityLabel')) out['aria-label'] = source.accessibilityLabel
  if (has('accessibilityHint')) out['aria-description'] = source.accessibilityHint
  if (has('testID')) out['data-testid'] = source.testID
  if (has('nativeID')) out.id = source.nativeID
  if (has('pointerEvents')) out['data-hozo-pointer-events'] = source.pointerEvents
  if (has('accessibilityLiveRegion')) {
    const region = source.accessibilityLiveRegion
    out['aria-live'] = region === 'none' ? undefined : region
  }
  if (has('accessibilityState')) {
    const state = source.accessibilityState as State | undefined
    out['data-hozo-disabled'] = state?.disabled ? '' : undefined
    out['aria-disabled'] = state?.disabled
    out['aria-selected'] = state?.selected
    out['aria-checked'] = state?.checked
    out['aria-busy'] = state?.busy
    out['aria-expanded'] = state?.expanded
  }
  if (has('accessibilityValue')) {
    const value = source.accessibilityValue as Value | undefined
    out['aria-valuemin'] = value?.min
    out['aria-valuemax'] = value?.max
    out['aria-valuenow'] = value?.now
    out['aria-valuetext'] = value?.text
  }
  if (has('style')) out.style = hozoDomStyle(source.style as HozoDomStyle)

  const ref = elementRef(source)
  if (ref) {
    out.ref = ref
    delete out.onLayout
    for (const name of RESPONDER_PROPS) delete out[name]
    // The pointer handlers the responder needs, after any the spread named.
    Object.assign(out, ref.responder?.handlers)
  }
  return out
}

/** A View's, Text's or document primitive's spread onto its element. */
export function hozoViewDomProps<T>(props: T): T {
  if (!props || typeof props !== 'object') return props
  return translate(props as Props, UNIVERSAL) as T
}

const IMAGE = new Set([...UNIVERSAL, 'defaultSource', 'src'])

// The uncompiled Image's resolution. Its fallback to `defaultSource` after a
// load error is state there; here it is the `onError` below.
function webSource(source: Source): string | undefined {
  if (typeof source === 'string') return source
  if (!source || typeof source !== 'object') return undefined
  if (Array.isArray(source)) {
    for (const candidate of source as readonly Source[]) {
      const resolved = webSource(candidate)
      if (resolved) return resolved
    }
    return undefined
  }
  const object = source as { uri?: string; default?: string }
  return typeof object.uri === 'string'
    ? object.uri
    : typeof object.default === 'string'
      ? object.default
      : undefined
}

/**
 * An Image's spread onto its `<img>`. `src` may be an object or a list of
 * them, and an accessibility label is the image's `alt`, as it is uncompiled.
 */
export function hozoImageDomProps<T>(props: T): T {
  if (!props || typeof props !== 'object') return props
  const source = props as Props
  const out = translate(source, IMAGE)
  if (Object.hasOwn(source, 'src') || Object.hasOwn(source, 'defaultSource')) {
    out.src = webSource(source.src as Source) ?? webSource(source.defaultSource as Source)
  }
  if (Object.hasOwn(source, 'accessibilityLabel')) {
    delete out['aria-label']
    if (!Object.hasOwn(source, 'alt')) out.alt = source.accessibilityLabel
  }
  // A `src` that fails to load falls back to `defaultSource`, as it does
  // uncompiled (#1126). Set on the element rather than kept in state: the
  // next render writes the same `src` prop, which React leaves alone.
  const fallback = webSource(source.defaultSource as Source)
  if (fallback && webSource(source.src as Source)) {
    const onError = source.onError as ((event: unknown) => void) | undefined
    out.onError = (event: { currentTarget: HTMLImageElement }) => {
      if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback
      onError?.(event)
    }
  }
  return out as T
}
