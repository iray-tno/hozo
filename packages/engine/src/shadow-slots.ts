type Style = Record<string, unknown>
type Shadow =
  | string
  | { value: string; parts: readonly (string | readonly [string, string])[] }
  | null
export interface ShadowSlots {
  outer?: Shadow
  outerColor?: string | null
  insetShadow?: Shadow
  insetColor?: string | null
  ringWidth?: number
  ringColor?: string | null
  insetRingWidth?: number
  insetRingColor?: string | null
  offsetWidth?: number
  offsetColor?: string | null
  ringInset?: boolean
}
type Spec = readonly [Style, ShadowSlots]
type Input = Style | number | false | null | undefined | readonly Input[]

function paint(shadow: Exclude<Shadow, null>, color: string | null | undefined) {
  if (typeof shadow === 'string') return shadow
  return color == null
    ? shadow.value
    : shadow.parts
        .map((part) => (typeof part === 'string' ? part : part[0] + color + part[1]))
        .join(', ')
}

export function hozoShadowStyles(
  styles: readonly Input[],
  specs: readonly Spec[] | ReadonlyMap<Style, ShadowSlots>,
  defaults: { ring: string; offset: string },
  candidates?: ReadonlyMap<Style, ShadowSlots>,
): (Style | number)[] {
  const metadata: ReadonlyMap<Style, ShadowSlots> = Array.isArray(specs)
    ? new Map(specs)
    : (specs as ReadonlyMap<Style, ShadowSlots>)
  const result: (Style | number)[] = []
  let state: ShadowSlots = {}
  let opaque = false
  function visit(style: Input): void {
    if (!style) return
    if (Array.isArray(style)) {
      for (const part of style) visit(part)
      return
    }
    if (typeof style === 'number') {
      // Cannot inspect a registered style ID without importing RN.
      opaque = true
      result.push(style)
      return
    }
    const object = style as Style
    result.push(object)
    const slots = metadata.get(object) ?? candidates?.get(object)
    if (slots) Object.assign(state, slots)
    else if ('boxShadow' in object) state = {}
  }
  for (const style of styles) visit(style)
  if (opaque) return result

  const layers: string[] = []
  if (state.insetShadow != null) layers.push(paint(state.insetShadow, state.insetColor))
  if (state.insetRingWidth !== undefined)
    layers.push(`inset 0 0 0 ${state.insetRingWidth}px ${state.insetRingColor ?? defaults.ring}`)
  const inset = state.ringInset ? 'inset ' : ''
  if (state.offsetWidth !== undefined)
    layers.push(`${inset}0 0 0 ${state.offsetWidth}px ${state.offsetColor ?? defaults.offset}`)
  if (state.ringWidth !== undefined)
    layers.push(
      `${inset}0 0 0 ${state.ringWidth + (state.offsetWidth ?? 0)}px ${state.ringColor ?? defaults.ring}`,
    )
  if (state.outer != null) layers.push(paint(state.outer, state.outerColor))
  if (layers.length || state.outer === null) result.push({ boxShadow: layers.join(', ') || 'none' })
  return result
}
