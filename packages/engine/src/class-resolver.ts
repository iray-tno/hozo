import type { FilterSlots } from './filter-slots.ts'
import type { GradientSlots } from './gradient-slots.ts'
import type { ShadowSlots } from './shadow-slots.ts'
import type { TransformSlots } from './transform-slots.ts'

/** A React Native style object, as the compiler emits it. */
export type StyleObject = Record<string, unknown>

/**
 * Compiler-owned text-size fallbacks are not explicit line heights. CSS's
 * --tw-leading register survives a later font-size rule; RN has one numeric
 * slot. The map marks actual generated objects, never class names or private
 * style keys. Only maps containing these fallbacks install this composition.
 */
export function hozoTextMetricStyles(
  styles: StyleObject[],
  defaults: ReadonlyMap<StyleObject, StyleObject>,
): StyleObject[] {
  if (
    !styles.some((style) => defaults.has(style)) ||
    !styles.some((style) => Object.hasOwn(style, 'lineHeight') && !defaults.has(style))
  )
    return styles
  // Default-free objects are built once by the generated factory. A state
  // update selects them; it never clones a style object or inspects ranks.
  return styles.map((style) => defaults.get(style) ?? style)
}

type TextMetricStyle = StyleObject | readonly TextMetricStyle[] | false | null | undefined

/**
 * A compiled text owner sees both its own entries and selected caller entries.
 * Keep the array order for every other field, and keep the last explicit
 * leading if a later font-size fallback would cover it.
 */
export function hozoMixedTextMetricStyles(
  styles: readonly TextMetricStyle[],
  ownDefaults: readonly StyleObject[],
  candidateDefaults?: ReadonlySet<StyleObject> | ReadonlyMap<StyleObject, StyleObject>,
): readonly TextMetricStyle[] {
  let explicit: StyleObject | undefined
  let endsWithDefault = false
  function visit(value: TextMetricStyle): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const part of value) visit(part)
      return
    }
    const style = value as StyleObject
    if (!Object.hasOwn(style, 'lineHeight')) return
    endsWithDefault = ownDefaults.includes(style) || candidateDefaults?.has(style) === true
    if (!endsWithDefault) explicit = style
  }
  for (const style of styles) visit(style)
  return endsWithDefault && explicit ? [...styles, { lineHeight: explicit.lineHeight }] : styles
}

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
 * Generated Tailwind owner states may append a cached cascade rank; legacy
 * two-entry groups and mixed/unranked conditional domains keep their order.
 * `!aria-…` is compiler-owned negative-predicate data. It still requires the
 * underlying owner fact; an absent fact is not a measured false value.
 */
export type StateGroup = readonly [readonly string[], StyleObject, number?]

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
type Composer = (styles: StyleObject[], deferred?: number) => StyleObject[]

export type ClassResolver = ((
  value: unknown,
  state?: ClassState,
  deferred?: number,
) => StyleObject[]) & {
  /** @internal Compiler-generated identities for mixed effect boundaries. */
  shadowSlots?: ReadonlyMap<StyleObject, ShadowSlots>
  gradientSlots?: ReadonlyMap<StyleObject, GradientSlots>
  transformSlots?: ReadonlyMap<StyleObject, TransformSlots>
  filterSlots?: ReadonlyMap<StyleObject, FilterSlots>
  /** @internal Identity of implicit leading, including on maps without explicit leading. */
  fontDefaults?: ReadonlySet<StyleObject> | ReadonlyMap<StyleObject, StyleObject>
  /** @internal Bit mask of this namespace's installed deferrable composers. */
  effectMask?: number
}

/** @internal Generated-data ABI, not a utility parser or a public cascade API. */
export interface ClassResolverPlan {
  schema: 1
  styles: Record<string, StyleObject>
  unsupported?: Record<string, string>
  states?: Record<string, readonly StateGroup[]>
  ambient?: ClassState
  compose?: Composer
  /** Ordinals from one complete compiler namespace. Missing means barrier. */
  ordering: {
    schema: 1
    ranks: Readonly<Record<string, readonly number[]>>
    /** Compiler-proven disjoint sets: unranked backgrounds and ranked text/physical padding. */
    independentBackgrounds?: readonly [barriers: string, independent: string]
  }
}

interface TemplateEntry {
  keys: readonly string[]
  style: StyleObject
  name: string
  ownerRank: number | undefined
}

interface Resolved {
  /** The unconditional styles, composed: what a string with no state classes returns. */
  base: StyleObject[]
  /** The same, before `compose`, for composing again with state styles. */
  raw: StyleObject[]
  /** Only materialized for a mixed compiler boundary, using the same selection. */
  deferredBases?: (StyleObject[] | undefined)[]
  /** State classes in this string, named if it is resolved without a state. */
  stateClasses: string[]
  /** Cached in final order. Fallback orders all resting writes before it. */
  template?: { entries: TemplateEntry[]; appendToBase: boolean }
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
export function createClassResolver(plan: ClassResolverPlan): ClassResolver
export function createClassResolver(
  styles: Record<string, StyleObject>,
  unsupported?: Record<string, string>,
  compose?: Composer,
  states?: Record<string, readonly StateGroup[]>,
  ambient?: ClassState,
): ClassResolver
export function createClassResolver(
  stylesOrPlan: Record<string, StyleObject> | ClassResolverPlan,
  unsupported: Record<string, string> = {},
  compose?: Composer,
  states: Record<string, readonly StateGroup[]> = {},
  ambient: ClassState = {},
): ClassResolver {
  let styles: Record<string, StyleObject>
  let ranks: ClassResolverPlan['ordering']['ranks'] | undefined
  let independentBackgrounds: ClassResolverPlan['ordering']['independentBackgrounds']
  if (typeof stylesOrPlan.schema === 'number') {
    const plan = stylesOrPlan as ClassResolverPlan
    if (
      plan.schema !== 1 ||
      plan.ordering?.schema !== 1 ||
      !plan.ordering.ranks ||
      typeof plan.ordering.ranks !== 'object'
    )
      throw new Error('Unsupported Hozo class plan schema')
    styles = plan.styles
    unsupported = plan.unsupported ?? {}
    compose = plan.compose
    states = plan.states ?? {}
    ambient = plan.ambient ?? {}
    ranks = plan.ordering.ranks
    independentBackgrounds = plan.ordering.independentBackgrounds
  } else styles = stylesOrPlan as Record<string, StyleObject>
  // Only mixed namespaces carrying the build-time proof allocate these.
  const barriers = independentBackgrounds && new Set(independentBackgrounds[0].split(' '))
  const independent = independentBackgrounds && new Set(independentBackgrounds[1].split(' '))
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
  // Absent is not false. A focused field must not silently claim that it
  // measured hover/press, or that a spread supplied a disabled driver.
  const supplied = (keys: readonly string[], name: string, facts: ClassState) => {
    if (!keys.every((key) => Object.hasOwn(facts, key))) {
      if (!warned.has(name)) {
        const missing = keys.filter((key) => !Object.hasOwn(facts, key))
        warn(name, `\`${name}\` needs state (${missing.join(', ')}) this element does not supply.`)
      }
      return false
    }
    return true
  }
  const positive = (keys: readonly string[], name: string, facts: ClassState) =>
    supplied(keys, name, facts) && keys.every((key) => Boolean(facts[key]))
  // Prepare only negative maps' exceptional groups once, not during state
  // updates or for every authored class lookup. Positive-only maps retain
  // their existing boolean matcher and allocate no predicate side table.
  let negative: Map<readonly string[], { keys: string[]; expected: boolean[] }> | undefined
  for (const groups of Object.values(states))
    for (const [keys] of groups)
      if (keys.some((key) => key.startsWith('!aria-')))
        (negative ??= new Map()).set(keys, {
          keys: keys.map((key) => (key.startsWith('!aria-') ? key.slice(1) : key)),
          expected: keys.map((key) => !key.startsWith('!aria-')),
        })
  const negativePredicates = negative
  const matches = negativePredicates
    ? (keys: readonly string[], name: string, facts: ClassState) => {
        const predicate = negativePredicates.get(keys)
        return predicate
          ? supplied(predicate.keys, name, facts) &&
              predicate.keys.every(
                (key, index) => Boolean(facts[key]) === predicate.expected[index],
              )
          : positive(keys, name, facts)
      }
    : positive

  function resolve(value: string): Resolved {
    const base: StyleObject[] = []
    const groups: TemplateEntry[] = []
    const stateClasses: string[] = []
    const decided: StyleObject[] = []
    // Build transient ranked entries only for the generated-plan ABI. A
    // single unassessed object still makes the whole string fall back unless
    // every drawable candidate belongs to the compiler's disjoint sets.
    let ranked: { rank: number; entry: TemplateEntry }[] | undefined = ranks ? [] : undefined
    let canKeepRanks = independent !== undefined
    let backgrounds: TemplateEntry[] | undefined
    const take = ranks
      ? (index: number, entry: TemplateEntry) => {
          if (!ranked) return
          const rank = ranks![entry.name]?.[index]
          if (rank === undefined) {
            if (canKeepRanks && barriers?.has(entry.name)) {
              // Their colours still compete in fallback order. The ranked
              // entries are only independent of these writes, not of one another.
              ;(backgrounds ??= []).push(entry)
            } else ranked = undefined
            return
          }
          if (canKeepRanks && !independent?.has(entry.name)) canKeepRanks = false
          if (!Number.isSafeInteger(rank) || rank < 0)
            throw new Error('Invalid Hozo class plan rank')
          ranked.push({ rank, entry })
        }
      : undefined
    for (const name of value.split(/\s+/)) {
      if (name === '') {
        continue
      }
      const style = styles[name]
      if (style) {
        base.push(style)
        take?.(0, { name, keys: [], style, ownerRank: undefined })
        continue
      }
      const conditional = states[name]
      if (conditional) {
        let needsState = false
        for (let index = 0; index < conditional.length; index++) {
          const group = conditional[index]!
          const entry = { name, keys: group[0], style: group[1], ownerRank: group[2] }
          take?.(index, entry)
          if ((negativePredicates?.get(entry.keys)?.keys ?? entry.keys).every(isAmbient)) {
            if (matches(entry.keys, name, ambient)) decided.push(entry.style)
            continue
          }
          groups.push(entry)
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
    if (ranked && (!backgrounds || canKeepRanks)) {
      // Stable ties keep input order. Strip rank objects before caching, so
      // neither cache hits nor state-only changes can read/sort priorities.
      ranked.sort((a, b) => a.rank - b.rank)
      const ordered: TemplateEntry[] = backgrounds ?? []
      for (const { entry } of ranked) {
        if ((negativePredicates?.get(entry.keys)?.keys ?? entry.keys).every(isAmbient)) {
          if (matches(entry.keys, entry.name, ambient)) ordered.push({ ...entry, keys: [] })
        } else ordered.push(entry)
      }
      const raw = ordered.filter((entry) => !entry.keys.length).map((entry) => entry.style)
      return {
        base: compose ? compose(raw) : raw,
        raw,
        stateClasses,
        template: groups.length ? { entries: ordered, appendToBase: false } : undefined,
      }
    }
    // Build-time Tailwind owner-state rank, sorted once per cached class string,
    // never on every state update. Mixed/unranked domains are left alone; ties
    // retain authored/caller order. Keep warning provenance beside each group.
    if (
      groups.length > 1 &&
      groups.every((group) => group.ownerRank !== undefined) &&
      groups.some((group, index) => index > 0 && groups[index - 1]!.ownerRank! > group.ownerRank!)
    ) {
      groups.sort((a, b) => a.ownerRank! - b.ownerRank!)
    }
    base.push(...decided)
    return {
      base: compose ? compose(base) : base,
      raw: base,
      stateClasses,
      template: groups.length ? { entries: groups, appendToBase: true } : undefined,
    }
  }

  function restingWithoutEffects(resolved: Resolved, deferred: number): StyleObject[] {
    const bases = (resolved.deferredBases ??= [])
    return (bases[deferred] ??= compose ? compose(resolved.raw, deferred) : resolved.raw)
  }

  const hozoClasses: ClassResolver = (value, state, deferred) => {
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
    if (deferred) deferred &= hozoClasses.effectMask ?? 0
    const template = resolved.template
    if (!template) return deferred ? restingWithoutEffects(resolved, deferred) : resolved.base
    if (state === undefined) {
      for (const name of resolved.stateClasses) {
        warn(
          name,
          `\`${name}\` applies in a state, and this element hands its classes no state to ` +
            'resolve it against. Put it on an owner that supplies this state, or write it as a static ' +
            'className so it compiles to a real style variant.',
        )
      }
      return deferred ? restingWithoutEffects(resolved, deferred) : resolved.base
    }
    // A group can name an ambient fact beside the element's own, as
    // `rtl:hover:` does; the element supplies only its part.
    const facts = { ...ambient, ...state }
    // Fully ranked writes may interleave with resting styles. The fallback
    // template has only state entries, so delay copying its resting prefix
    // until an actual state matches. Both routes select by the same loop.
    const all: StyleObject[] = []
    let active = false
    for (const entry of template.entries) {
      if (!entry.keys.length) all.push(entry.style)
      else if (matches(entry.keys, entry.name, facts)) {
        if (!active && template.appendToBase) {
          for (const style of resolved.raw) all.push(style)
        }
        all.push(entry.style)
        active = true
      }
    }
    if (!active) return deferred ? restingWithoutEffects(resolved, deferred) : resolved.base
    // A state style can carry a transform, which `compose` folds into one;
    // so it runs over the whole list, and the result is per render rather
    // than cached -- it changes with the state.
    return compose ? compose(all, deferred) : all
  }
  return hozoClasses
}
