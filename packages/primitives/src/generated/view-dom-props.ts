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
// `onLayout` and the responder props are not here: they need the element and
// an effect, which a function called during render does not have.

import { type HozoDomStyle, hozoDomStyle } from '@hozo/engine'

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
  return out
}

/** A View's, Text's or document primitive's spread onto its element. */
export function hozoViewDomProps<T>(props: T): T {
  if (!props || typeof props !== 'object') return props
  return translate(props as Props, UNIVERSAL) as T
}

const IMAGE = new Set([...UNIVERSAL, 'defaultSource', 'src'])

// The uncompiled Image's resolution, minus the fallback to `defaultSource`
// after a load error: that needs state, and this runs during render.
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
  return out as T
}
