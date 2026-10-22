/** A React Native style object, as the compiler emits it. */
export type StyleObject = Record<string, unknown>

/**
 * The state an element is in when its runtime classes are resolved: what
 * its pressable reports (`pressed`, `hovered`, `focused`, `focusVisible`)
 * and what its props say: `disabled`, and `aria-checked`, `aria-selected` and
 * the rest under their attribute names, so `aria-pressed` cannot be read as
 * the pointer's `pressed`. Plain data-presence conditions use `data-foo`
 * booleans supplied by the actual owner: true means the attribute is present,
 * false means absent, and a missing key is unassessed (and diagnosed).
 * Simple equality predicates use `data-foo=value` booleans, with case-sensitive
 * safe token values normalized at build time. Presence cannot satisfy equality.
 * These are normalized facts, not raw HTML attribute values or selectors.
 */
export type ClassState = Readonly<Record<string, unknown>>

/**
 * A class that applies only in a state: the state keys that all have to
 * hold, and the style it applies then. `active:opacity-80` is
 * `[['pressed'], { opacity: 0.8 }]`.
 */
export type StateGroup = readonly [readonly string[], StyleObject]

/**
 * Resolves whitespace-separated class names to React Native style objects.
 *
 * Returns an array, which is a valid `style` value on its own and also
 * nests inside one -- RN flattens arbitrarily nested style arrays, so
 * callers never have to spread it.
 *
 * `state` is what the element is in. Without it, a class that applies only
 * in a state is reported as it always was; with it, that class applies
 * when its state holds, after the unconditional ones.
 */
export type ClassResolver = (value: unknown, state?: ClassState) => StyleObject[]

interface Resolved {
  /** The unconditional styles, composed: what a string with no state classes returns. */
  base: StyleObject[]
  /** The same, before `compose`, for composing again with state styles. */
  raw: StyleObject[]
  groups: StateGroup[]
  /** Parallel to groups: retain the candidate name for missing-fact warnings. */
  groupClasses: string[]
  /** State classes in this string, named if it is resolved without a state. */
  stateClasses: string[]
}

/**
 * Builds a resolver over one project's candidate map.
 *
 * Called by the generated candidate module rather than by application
 * code: `styles`, `unsupported` and `states` are build output, and binding
 * them here keeps the generated file to data plus one call.
 *
 * `unsupported` maps a class the compiler *recognized but can't express*
 * as a plain style object -- a utility under a breakpoint or `dark:`, or
 * one that's Web-only -- to the reason. Those are reported when they're
 * actually used rather than at build time, because a class appearing in
 * the project's candidate scan doesn't mean any dynamic expression ever
 * produces it.
 *
 * `states` holds the classes whose only condition is the element's own
 * state (#886). Those need no tracking here: the pressable that renders
 * the element already tracks it and hands it in, so this stays a function
 * of the class string and that state.
 *
 * `ambient` holds facts that cannot change while the app runs, so no
 * element has to supply them: `rtl` and `ltr`, because React Native needs
 * a reload for a direction change to take effect. A class conditioned on
 * them alone is decided once, when its string is first resolved, and then
 * cached like an unconditional one -- after the unconditional ones, which is
 * where Tailwind puts a variant too.
 */
export function createClassResolver(
  styles: Record<string, StyleObject>,
  unsupported: Record<string, string> = {},
  compose?: (styles: StyleObject[]) => StyleObject[],
  states: Record<string, readonly StateGroup[]> = {},
  ambient: ClassState = {},
): ClassResolver {
  const isAmbient = (key: string) => Object.hasOwn(ambient, key)
  // Class strings repeat constantly across renders and list items, and the
  // result is immutable, so each distinct string is resolved once.
  const cache = new Map<string, Resolved>()
  // Warn once per class, not once per render -- a warning inside a list's
  // render path would otherwise repeat for every row, every frame.
  const warned = new Set<string>()
  const warn = (name: string, reason: string) => {
    if (warned.has(name)) return
    warned.add(name)
    // eslint-disable-next-line no-console
    console.warn(`[hozo] ${reason}`)
  }

  function resolve(value: string): Resolved {
    const base: StyleObject[] = []
    const groups: StateGroup[] = []
    const groupClasses: string[] = []
    const stateClasses: string[] = []
    const decided: StyleObject[] = []
    for (const name of value.split(/\s+/)) {
      if (name === '') {
        continue
      }
      const style = styles[name]
      if (style) {
        base.push(style)
        continue
      }
      const conditional = states[name]
      if (conditional) {
        let needsState = false
        for (const group of conditional) {
          if (group[0].every(isAmbient)) {
            if (group[0].every((key) => Boolean(ambient[key]))) decided.push(group[1])
            continue
          }
          groups.push(group)
          groupClasses.push(name)
          needsState = true
        }
        if (needsState) stateClasses.push(name)
        continue
      }
      // An unknown class isn't necessarily a Hozo problem -- it may be an
      // app's own non-Tailwind class, or a testID-ish marker -- so only the
      // ones the compiler recognized and refused are reported.
      const reason = unsupported[name]
      if (reason) warn(name, reason)
    }
    base.push(...decided)
    return { base: compose ? compose(base) : base, raw: base, groups, groupClasses, stateClasses }
  }

  return function hozoClasses(value: unknown, state?: ClassState): StyleObject[] {
    // Falsy is the normal case, not an error: `cond && 'p-4'` yields
    // `false` whenever the condition is off.
    if (typeof value !== 'string' || value === '') {
      return []
    }

    let resolved = cache.get(value)
    if (!resolved) {
      resolved = resolve(value)
      cache.set(value, resolved)
    }
    if (resolved.groups.length === 0) return resolved.base
    if (state === undefined) {
      for (const name of resolved.stateClasses) {
        warn(
          name,
          `\`${name}\` applies in a state, and this element hands its classes no state to ` +
            'resolve it against. Put it on an owner that supplies this state, or write it as a static ' +
            'className so it compiles to a real style variant.',
        )
      }
      return resolved.base
    }
    // A group can name an ambient fact beside the element's own, as
    // `rtl:hover:` does; the element supplies only its part.
    const facts = { ...ambient, ...state }
    const active = resolved.groups.filter(([keys], index) => {
      // Absent is not false. A focused field must not silently claim that it
      // measured hover/press, or that a spread supplied a disabled driver.
      if (!keys.every((key) => Object.hasOwn(facts, key))) {
        const name = resolved.groupClasses[index]!
        if (!warned.has(name)) {
          const missing = keys.filter((key) => !Object.hasOwn(facts, key))
          warn(
            name,
            `\`${name}\` needs state (${missing.join(', ')}) this element does not supply.`,
          )
        }
        return false
      }
      return keys.every((key) => Boolean(facts[key]))
    })
    if (active.length === 0) return resolved.base
    const all = [...resolved.raw, ...active.map(([, style]) => style)]
    // A state style can carry a transform, which `compose` folds into one;
    // so it runs over the whole list, and the result is per render rather
    // than cached -- it changes with the state.
    return compose ? compose(all) : all
  }
}
