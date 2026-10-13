/** A React Native style object, as the compiler emits it. */
export type StyleObject = Record<string, unknown>

/**
 * The state an element is in when its runtime classes are resolved: what
 * its pressable reports (`pressed`, `hovered`, `focused`, `focusVisible`)
 * and what its props say: `disabled`, and `aria-checked`, `aria-selected` and
 * the rest under their attribute names, so `aria-pressed` cannot be read as
 * the pointer's `pressed`.
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
 */
export function createClassResolver(
  styles: Record<string, StyleObject>,
  unsupported: Record<string, string> = {},
  compose?: (styles: StyleObject[]) => StyleObject[],
  states: Record<string, readonly StateGroup[]> = {},
): ClassResolver {
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
    const stateClasses: string[] = []
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
        groups.push(...conditional)
        stateClasses.push(name)
        continue
      }
      // An unknown class isn't necessarily a Hozo problem -- it may be an
      // app's own non-Tailwind class, or a testID-ish marker -- so only the
      // ones the compiler recognized and refused are reported.
      const reason = unsupported[name]
      if (reason) warn(name, reason)
    }
    return { base: compose ? compose(base) : base, raw: base, groups, stateClasses }
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
            'resolve it against. Put it on a Pressable, Button or Link, or write it as a static ' +
            'className so it compiles to a real style variant.',
        )
      }
      return resolved.base
    }
    const active = resolved.groups.filter(([keys]) => keys.every((key) => Boolean(state[key])))
    if (active.length === 0) return resolved.base
    const all = [...resolved.raw, ...active.map(([, style]) => style)]
    // A state style can carry a transform, which `compose` folds into one;
    // so it runs over the whole list, and the result is per render rather
    // than cached -- it changes with the state.
    return compose ? compose(all) : all
  }
}
