// CSS has four independently cascading transform properties. Metadata lives
// beside, never inside, RN StyleSheet entries; no private style key reaches RN.
export type TransformEntry = Record<string, number | string | readonly number[]>
type Mode = 'slots' | 'authored' | 'none'
export interface TransformSlots {
  translate?: Mode
  translateSlots?: TransformEntry[]
  translateAuthored?: TransformEntry[]
  rotate?: TransformEntry[]
  scale?: Mode
  scaleSlots?: TransformEntry[]
  scale3d?: boolean
  scaleAuthored?: TransformEntry[]
  functions?: Mode
  functionsSlots?: TransformEntry[]
  functionsAuthored?: TransformEntry[]
}
type Style = Record<string, unknown>
export type TransformSpec = readonly [Style, TransformSlots]
export type TransformStyle = Style | false | null | undefined | readonly TransformStyle[]

/** Only generated reset-bearing boundaries need this; plain styles bypass it. */
export function hozoTransformStyles(
  styles: readonly TransformStyle[],
  specs: readonly TransformSpec[] | ReadonlyMap<Style, TransformSlots>,
): Style[] {
  // Candidate maps can contain thousands of entries. They pre-index once;
  // resolving one class string must never walk the entire project map.
  const metadata: ReadonlyMap<Style, TransformSlots> = Array.isArray(specs)
    ? new Map(specs)
    : (specs as ReadonlyMap<Style, TransformSlots>)
  const result: Style[] = []
  const families = {
    translate: {
      slots: new Map<string, TransformEntry>(),
      authored: [] as TransformEntry[],
      mode: 'slots' as Mode,
    },
    scale: {
      slots: new Map<string, TransformEntry>(),
      authored: [] as TransformEntry[],
      mode: 'slots' as Mode,
    },
    functions: {
      slots: new Map<string, TransformEntry>(),
      authored: [] as TransformEntry[],
      mode: 'slots' as Mode,
    },
  }
  let rotate: TransformEntry[] = []
  let scale3d = false
  let touched = false
  function visit(style: TransformStyle): void {
    if (!style) return
    if (Array.isArray(style)) {
      for (const part of style) visit(part)
      return
    }
    const object = style as Style
    const slots = metadata.get(object)
    if (!slots) {
      result.push(object)
      // An authored RN transform is a whole-array override, not CSS slots.
      if ('transform' in object) {
        for (const family of Object.values(families)) {
          family.slots.clear()
          family.authored = []
          family.mode = 'none'
        }
        rotate = []
        scale3d = false
        touched = false
      }
      return
    }
    const { transform: _transform, ...rest } = object
    if (Object.keys(rest).length) result.push(rest)
    touched = true
    if (slots.rotate) rotate = slots.rotate
    if (slots.scale3d !== undefined) scale3d = slots.scale3d
    for (const name of ['translate', 'scale', 'functions'] as const) {
      const family = families[name]
      for (const entry of slots[`${name}Slots`] ?? []) {
        // A uniform 2D scale writes both registers. Keep Z's matrix separate.
        if (name === 'scale' && 'scale' in entry) {
          family.slots.set('scaleX', { scaleX: entry.scale })
          family.slots.set('scaleY', { scaleY: entry.scale })
        } else {
          const key = Object.keys(entry)[0]
          if (key) family.slots.set(key, entry)
        }
      }
      const authored = slots[`${name}Authored`]
      if (authored) family.authored = authored
      if (slots[name]) family.mode = slots[name]
    }
  }
  for (const style of styles) visit(style)
  if (touched) {
    const output = (name: keyof typeof families, keys: string[]): TransformEntry[] => {
      const family = families[name]
      if (family.mode === 'none') return []
      if (family.mode === 'authored') return family.authored
      return keys.flatMap((key) => {
        const entry = family.slots.get(key)
        return entry ? [entry] : []
      })
    }
    result.push({
      transform: [
        ...output('translate', ['translateX', 'translateY', 'matrix']),
        ...rotate,
        ...output('scale', scale3d ? ['scaleX', 'scaleY', 'matrix'] : ['scaleX', 'scaleY']),
        ...output('functions', ['rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY']),
      ],
    })
  }
  return result
}
