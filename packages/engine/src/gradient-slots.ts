// Values/defaults are compiler data. This joins selected gradient registers;
// it neither parses CSS nor chooses classes, conditions or precedence.
type Style = Record<string, unknown>
type Image = { kind: string; prelude: string } | string | null
export interface GradientSlots {
  image?: Image
  colors?: readonly (readonly [number, string | null])[]
  positions?: readonly (readonly [number, string])[]
}
export interface GradientDefaults {
  color: string
  positions: readonly string[]
}
export type GradientSpec = readonly [Style, GradientSlots]
export type GradientStyle = Style | number | false | null | undefined | readonly GradientStyle[]

export function hozoGradientStyles(
  styles: readonly GradientStyle[],
  specs: readonly GradientSpec[] | ReadonlyMap<Style, GradientSlots>,
  defaults: GradientDefaults,
  candidates?: ReadonlyMap<Style, GradientSlots>,
): (Style | number)[] {
  const metadata: ReadonlyMap<Style, GradientSlots> = Array.isArray(specs)
    ? new Map(specs)
    : (specs as ReadonlyMap<Style, GradientSlots>)
  const result: (Style | number)[] = []
  const state: { image?: Image } = {}
  const colors = new Map<number, string | null>()
  const positions = new Map<number, string>()
  let opaque = false
  function visit(style: GradientStyle): void {
    if (!style) return
    if (Array.isArray(style)) {
      for (const part of style) visit(part)
      return
    }
    if (typeof style === 'number') {
      // A registered RN style ID cannot be inspected without RN. Preserve
      // the previous whole-property path rather than overriding unseen data.
      opaque = true
      result.push(style)
      return
    }
    const object = style as Style
    result.push(object)
    const slots = metadata.get(object) ?? candidates?.get(object)
    if (!slots) {
      if ('backgroundImage' in object) {
        state.image = undefined
        colors.clear()
        positions.clear()
      }
      return
    }
    if (slots.image !== undefined) state.image = slots.image
    for (const [key, value] of slots.colors ?? []) colors.set(key, value)
    for (const [key, value] of slots.positions ?? []) positions.set(key, value)
  }
  for (const style of styles) visit(style)
  const image = state.image
  if (opaque || image === undefined) return result
  let value: string
  if (image === null) value = 'none'
  else if (typeof image === 'string') value = image
  else {
    const stop = (index: number) =>
      `${colors.get(index) ?? defaults.color} ${positions.get(index) ?? defaults.positions[index]}`
    const stops = [stop(0), ...(colors.get(1) ? [stop(1)] : []), stop(2)]
    value = `${image.kind}(${[...(image.prelude ? [image.prelude] : []), ...stops].join(', ')})`
  }
  result.push({ backgroundImage: value })
  return result
}
