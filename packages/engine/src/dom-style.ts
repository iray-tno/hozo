import type { CSSProperties } from 'react'

export type HozoDomStyle =
  | CSSProperties
  | Readonly<Record<string, unknown>>
  | readonly HozoDomStyle[]
  | false
  | null
  | undefined

const warned = new Set<string>()

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[hozo] ${message}`)
}

function flattenInto(value: unknown, target: Record<string, unknown>) {
  if (value == null || value === false) return
  if (Array.isArray(value)) {
    for (const item of value) flattenInto(item, target)
    return
  }
  if (typeof value !== 'object') {
    warnOnce(
      `style:${typeof value}`,
      `A React Native style ${JSON.stringify(value)} could not be resolved for the DOM. Pass style objects rather than registered numeric IDs or primitive values.`,
    )
    return
  }
  Object.assign(target, value)
}

function length(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`
  if (typeof value === 'string') return value
  return undefined
}

function transformValue(name: string, value: unknown): string | undefined {
  if (
    name === 'matrix' &&
    Array.isArray(value) &&
    value.every((part) => typeof part === 'number')
  ) {
    return `matrix(${value.join(', ')})`
  }
  if (name === 'translate' && Array.isArray(value) && value.length === 2) {
    const x = length(value[0])
    const y = length(value[1])
    return x && y ? `translate(${x}, ${y})` : undefined
  }
  if (name === 'translateX' || name === 'translateY' || name === 'perspective') {
    const resolved = length(value)
    return resolved ? `${name}(${resolved})` : undefined
  }
  if (
    name === 'rotate' ||
    name === 'rotateX' ||
    name === 'rotateY' ||
    name === 'rotateZ' ||
    name === 'skewX' ||
    name === 'skewY'
  ) {
    return typeof value === 'string' ? `${name}(${value})` : undefined
  }
  if (name === 'scale' || name === 'scaleX' || name === 'scaleY') {
    return typeof value === 'number' && Number.isFinite(value) ? `${name}(${value})` : undefined
  }
  return undefined
}

function normalizeTransform(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return undefined
  const functions: string[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnOnce(
        'transform:entry',
        'A React Native transform entry is not a one-property object and was omitted on Web.',
      )
      continue
    }
    const entries = Object.entries(entry)
    if (entries.length !== 1) {
      warnOnce(
        'transform:shape',
        'A React Native transform entry must contain exactly one transform and was omitted on Web.',
      )
      continue
    }
    const [name, input] = entries[0] as [string, unknown]
    const resolved = transformValue(name, input)
    if (resolved) functions.push(resolved)
    else
      warnOnce(
        `transform:${name}`,
        `React Native transform \`${name}\` has no compatible DOM conversion for this value and was omitted.`,
      )
  }
  return functions.length > 0 ? functions.join(' ') : undefined
}

const unsupported = new Map<string, string>([
  ['borderCurve', 'CSS has no equivalent for React Native borderCurve'],
  ['elevation', 'CSS has no equivalent for Android elevation without choosing an invented shadow'],
  ['includeFontPadding', 'CSS cannot reproduce Android font padding'],
  ['overlayColor', 'CSS images have no equivalent for React Native overlayColor'],
  ['shadowColor', 'legacy React Native shadow props need an explicit CSS boxShadow'],
  ['shadowOffset', 'legacy React Native shadow props need an explicit CSS boxShadow'],
  ['shadowOpacity', 'legacy React Native shadow props need an explicit CSS boxShadow'],
  ['shadowRadius', 'legacy React Native shadow props need an explicit CSS boxShadow'],
  ['textAlignVertical', 'CSS vertical-align does not reproduce React Native textAlignVertical'],
  ['tintColor', 'CSS has no general color-preserving equivalent for React Native tintColor'],
])

/**
 * Converts React Native's StyleProp shape to the single object React DOM requires.
 * Arrays are recursively flattened, falsy entries are ignored, and later objects win.
 */
export function hozoDomStyle(input: HozoDomStyle): CSSProperties | undefined {
  const flat: Record<string, unknown> = {}
  flattenInto(input, flat)

  if ('transform' in flat) {
    const transform = normalizeTransform(flat.transform)
    if (transform) flat.transform = transform
    else delete flat.transform
  }
  if (Array.isArray(flat.transformOrigin)) {
    const origin = flat.transformOrigin.map(length)
    if (origin.every(Boolean)) flat.transformOrigin = origin.join(' ')
    else {
      warnOnce(
        'transformOrigin',
        'A React Native transformOrigin array contained a value CSS cannot express and was omitted on Web.',
      )
      delete flat.transformOrigin
    }
  }
  if (Array.isArray(flat.fontVariant)) flat.fontVariant = flat.fontVariant.join(' ')
  if (typeof flat.resizeMode === 'string') {
    const objectFit = { contain: 'contain', cover: 'cover', stretch: 'fill', center: 'none' }[
      flat.resizeMode
    ]
    if (objectFit) flat.objectFit = objectFit
    else
      warnOnce(
        `resizeMode:${flat.resizeMode}`,
        `React Native resizeMode \`${flat.resizeMode}\` has no equivalent CSS object-fit value and was omitted.`,
      )
    delete flat.resizeMode
  }
  for (const [name, reason] of unsupported) {
    if (!(name in flat)) continue
    warnOnce(`property:${name}`, `${reason}; inline style property \`${name}\` was omitted on Web.`)
    delete flat[name]
  }

  return Object.keys(flat).length > 0 ? (flat as CSSProperties) : undefined
}

/** Normalizes a possible style field without cloning ordinary prop spreads. */
export function hozoDomProps<T>(props: T): T {
  if (!props || typeof props !== 'object' || !Object.hasOwn(props, 'style')) return props
  // Clone first so an accessor is read exactly once, as it was by the
  // original JSX spread. Reading props.style separately would run it twice.
  const copy = { ...props } as T & { style?: HozoDomStyle }
  copy.style = hozoDomStyle(copy.style)
  return copy
}
