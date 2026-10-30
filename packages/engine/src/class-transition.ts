// What a runtime-resolved class string says about transitions.
//
// A transition utility draws nothing on React Native, so the class resolver
// has nothing to return for one, and it used to be reported as Web-only and
// dropped. A component that resolves its look at run time -- a pattern's
// indicator, say -- then had no way to animate on Native what its classes
// animate on the Web (#1450). The candidate module now emits each transition
// utility's part of a spec, and this reads a class string into one spec for
// `HozoAnimated` to run.

/** `HozoAnimated`'s spec, as `@hozo/primitives` defines it. */
export interface ClassTransitionSpec {
  duration: number
  delay?: number
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  properties?: readonly string[]
}

/** @internal Generated-data ABI: one transition utility's condition and part. */
export type ClassTransitionTable = Readonly<
  Record<
    string,
    readonly [condition: 'motion-reduce' | 'motion-safe' | null, Partial<ClassTransitionSpec>]
  >
>

/**
 * Reads the transition a class string asks for, or `undefined` when it asks
 * for none.
 *
 * `reduceMotion` decides the `motion-reduce:` and `motion-safe:` parts, as
 * the media query does on the Web; the caller reads it, so this stays a pure
 * function of its arguments.
 */
export type ClassTransition = (
  value: unknown,
  environment: { reduceMotion: boolean },
) => ClassTransitionSpec | undefined

/**
 * Builds the reader over one project's transition table.
 *
 * Later classes win, field by field, as later declarations do in a
 * stylesheet. A string with no `transition*` utility asks for no
 * transition, whatever its duration says: on the Web `transition-property`
 * is what turns one on. Its defaults are Tailwind's: 150ms and
 * `ease-in-out`'s curve, which `transition-*` utilities normally set
 * themselves.
 */
export function createClassTransitions(table: ClassTransitionTable): ClassTransition {
  return (value, { reduceMotion }) => {
    if (typeof value !== 'string' || value === '') return undefined
    let spec: Partial<ClassTransitionSpec> | undefined
    for (const name of value.split(/\s+/)) {
      const entry = table[name]
      if (!entry) continue
      const [condition, part] = entry
      if (condition === 'motion-reduce' && !reduceMotion) continue
      if (condition === 'motion-safe' && reduceMotion) continue
      spec = { ...spec, ...part }
    }
    if (!spec?.properties || spec.properties.length === 0) return undefined
    if (spec.properties.length === 1 && spec.properties[0] === 'none') return undefined
    return {
      duration: spec.duration ?? 150,
      delay: spec.delay,
      easing: spec.easing ?? 'ease-in-out',
      properties: spec.properties,
    }
  }
}
