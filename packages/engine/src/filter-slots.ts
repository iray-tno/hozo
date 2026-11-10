// Slot numbers and function strings come from the compiler, not a second
// Tailwind ordering table. Only cross-condition filter boundaries import this.
type Style = Record<string, unknown>
type FilterStyle = Style | false | null | undefined | readonly FilterStyle[]
export interface FilterSlots {
  mode: 'slots' | 'none' | 'authored'
  slots?: readonly (readonly [number, string])[]
  authored?: string
}
export type FilterSpec = readonly [Style, FilterSlots]

export function hozoFilterStyles(
  styles: readonly FilterStyle[],
  specs: readonly FilterSpec[] | ReadonlyMap<Style, FilterSlots>,
): Style[] {
  const metadata: ReadonlyMap<Style, FilterSlots> = Array.isArray(specs)
    ? new Map(specs)
    : (specs as ReadonlyMap<Style, FilterSlots>)
  const result: Style[] = []
  const slots = new Map<number, string>()
  const state = { mode: 'slots' as FilterSlots['mode'], authored: '' }
  let touched = false
  function visit(style: FilterStyle): void {
    if (!style) return
    if (Array.isArray(style)) {
      for (const part of style) visit(part)
      return
    }
    const object = style as Style
    // Preserve identity: transform metadata may refer to the very same entry.
    // The final filter wins over these intermediate whole-chain strings.
    result.push(object)
    const spec = metadata.get(object)
    if (!spec) {
      if ('filter' in object) {
        slots.clear()
        touched = false
      }
      return
    }
    touched = true
    for (const [key, value] of spec.slots ?? []) slots.set(key, value)
    state.mode = spec.mode
    if (spec.authored !== undefined) state.authored = spec.authored
  }
  for (const style of styles) visit(style)
  if (touched) {
    result.push({
      filter:
        state.mode === 'none'
          ? 'none'
          : state.mode === 'authored'
            ? state.authored
            : [...slots]
                .sort(([a], [b]) => a - b)
                .map(([, value]) => value)
                .filter(Boolean)
                .join(' '),
    })
  }
  return result
}
