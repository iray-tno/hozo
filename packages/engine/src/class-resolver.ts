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
  registers?: ReadonlyMap<StyleObject, StyleObject>,
): StyleObject[] {
  if (registers && styles.some((style) => registers.has(style))) {
    let leading: StyleObject | undefined
    let hasDefault = false
    let hasExplicit = false
    for (const style of styles) {
      if (defaults.has(style)) hasDefault = true
      else if (Object.hasOwn(style, 'lineHeight')) hasExplicit = true
      else leading = registers.get(style) ?? leading
    }
    // Until the direct declaration and the reader have a shared assessed
    // order, keep the existing explicit-leading projection. A later
    // register cannot become a direct line-height just by appearing last.
    if (hasDefault && !hasExplicit && leading) {
      return [...styles.map((style) => defaults.get(style) ?? style), leading]
    }
  }
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
  candidateRegisters?: ReadonlyMap<StyleObject, StyleObject>,
  ownRegisters?: readonly (readonly [StyleObject, number])[],
): readonly TextMetricStyle[] {
  let explicit: StyleObject | undefined
  let endsWithDefault = false
  let hasDefault = false
  let register: number | undefined
  function visit(value: TextMetricStyle): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const part of value) visit(part)
      return
    }
    const style = value as StyleObject
    const captured =
      ownRegisters?.find(([entry]) => entry === style)?.[1] ??
      (candidateRegisters?.get(style)?.lineHeight as number | undefined)
    if (captured !== undefined) register = captured
    if (!Object.hasOwn(style, 'lineHeight')) return
    endsWithDefault = ownDefaults.includes(style) || candidateDefaults?.has(style) === true
    hasDefault ||= endsWithDefault
    if (!endsWithDefault) {
      explicit = style
    }
  }
  for (const style of styles) visit(style)
  if (hasDefault && !explicit && register !== undefined)
    return [...styles, { lineHeight: register }]
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
  /** @internal Captured register writes keyed by original generated style. */
  leadingRegisters?: ReadonlyMap<StyleObject, StyleObject>
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
    /** Compiler-proven disjoint sets: unranked colours and admitted ranked scalars. */
    independentColors?: readonly [barriers: string, independent: string]
    /** Lists disjoint colour writers. Older schema-1 maps may send a redundant true. */
    rankedStates?: true | string
  }
}

interface TemplateEntry {
  keys: readonly string[]
  style: StyleObject
  name: string
  ownerRank: number | undefined
}

interface RankedEntry extends TemplateEntry {
  rank: number | undefined
}

/** Each inline family as `[start, end, left, right]`. */
const INLINE_EDGES = [
  ['paddingStart', 'paddingEnd', 'paddingLeft', 'paddingRight'],
  ['marginStart', 'marginEnd', 'marginLeft', 'marginRight'],
  ['start', 'end', 'left', 'right'],
  ['borderStartWidth', 'borderEndWidth', 'borderLeftWidth', 'borderRightWidth'],
  ['borderStartColor', 'borderEndColor', 'borderLeftColor', 'borderRightColor'],
] as const

type InlineFamily = (typeof INLINE_EDGES)[number]

/** The families these styles write both logically and physically. */
function mixedInlineEdges(styles: Iterable<StyleObject>): InlineFamily[] {
  let logical = 0
  let physical = 0
  for (const style of styles) {
    INLINE_EDGES.forEach(([start, end, left, right], family) => {
      if (Object.hasOwn(style, start) || Object.hasOwn(style, end)) logical |= 1 << family
      if (Object.hasOwn(style, left) || Object.hasOwn(style, right)) physical |= 1 << family
    })
  }
  return INLINE_EDGES.filter((_, family) => logical & physical & (1 << family))
}

/**
 * Tailwind lets the later of `px-8 pl-1` win; React Native does not. Without
 * `swapLeftAndRightInRTL` Yoga prefers `paddingStart` to `paddingLeft` in any
 * order, and with it -- the default -- RTL turns `paddingLeft` into
 * `paddingStart`, overwriting it, so the physical write wins on the other
 * side. Start and end mean the same under both, so in a family the class
 * string writes both ways, physical writes are renamed to the logical side
 * they are in this direction, and array order decides as the cascade did
 * (#2018). The family is chosen per class string, states included, as the
 * static compiler chooses it per element: `pl-1` must not change sides when
 * `hover:ps-8` beside it stops applying.
 */
function projectInlineEdges(
  styles: StyleObject[],
  mixed: readonly InlineFamily[] | undefined,
  rtl: boolean,
): StyleObject[] {
  if (!mixed?.length) return styles
  return styles.map((style) => {
    let projected: StyleObject | undefined
    for (const [start, end, left, right] of mixed) {
      for (const [physical, logical] of [
        [left, rtl ? end : start],
        [right, rtl ? start : end],
      ] as const) {
        if (!Object.hasOwn(style, physical)) continue
        projected ??= { ...style }
        const value = projected[physical]
        delete projected[physical]
        projected[logical] = value
      }
    }
    return projected ?? style
  })
}

/** An assessed run may not move across a Native specificity boundary or
 * unknown write. The compiler can separately prove that specific holes do
 * not interact with the whole tier. */
function orderRankedRuns(
  entries: RankedEntry[],
  sharedTier: boolean,
  disjointHoles: boolean,
  start = 0,
  limit = entries.length,
) {
  while (start < limit - 1) {
    let end = start
    let previous = -1
    let inverted = false
    const specificity = entries[start]!.ownerRank
    for (; end < limit; end++) {
      const { rank, ownerRank } = entries[end]!
      if (!sharedTier && ownerRank !== specificity) break
      if (rank === undefined) {
        if (!disjointHoles) break
        continue
      }
      inverted ||= previous > rank
      previous = rank
    }
    if (inverted && end === start + 2) {
      // Both entries had ranks, otherwise no inversion was possible.
      const first = entries[start]!
      entries[start] = entries[start + 1]!
      entries[start + 1] = first
    } else if (inverted) {
      const run = entries.slice(start, end)
      const ranked = disjointHoles ? run.filter((entry) => entry.rank !== undefined) : run
      ranked.sort((a, b) => a.rank! - b.rank!)
      let next = 0
      for (let index = start; index < end; index++)
        if (entries[index]!.rank !== undefined) entries[index] = ranked[next++]!
    }
    // A different specificity starts a new run; an unranked write pins
    // its own position and can be skipped.
    start = end + (end < limit && entries[end]!.rank === undefined ? 1 : 0)
  }
}

function orderRestingRuns(
  entries: RankedEntry[],
  barriers: ReadonlySet<string> | undefined,
  independent: ReadonlySet<string> | undefined,
  disjoint: boolean,
) {
  if (disjoint || !independent || !barriers) {
    orderRankedRuns(entries, true, disjoint)
    return
  }
  // The full input did not qualify, but the same compiler proof can
  // admit an island bounded by an unrelated or overlapping write.
  let start = 0
  let hasColour = false
  for (let end = 0; end <= entries.length; end++) {
    const entry = entries[end]
    if (entry && (entry.rank === undefined ? barriers : independent).has(entry.name)) {
      hasColour ||= entry.rank === undefined
      continue
    }
    if (hasColour) orderRankedRuns(entries, true, true, start, end)
    start = end + 1
    hasColour = false
  }
  orderRankedRuns(entries, true, false)
}

interface Resolved {
  /** The unconditional styles, composed: what a string with no state classes returns. */
  base: StyleObject[]
  /** The same, before `compose`, for composing again with state styles. */
  raw: StyleObject[]
  /** Inline families this string writes both ways, states included (#2018). */
  edges?: readonly InlineFamily[]
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
  let independentColors: ClassResolverPlan['ordering']['independentColors']
  let stateColors: Set<string> | undefined
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
    independentColors = plan.ordering.independentColors
    if (typeof plan.ordering.rankedStates === 'string')
      stateColors = new Set(plan.ordering.rankedStates.split(' '))
  } else styles = stylesOrPlan as Record<string, StyleObject>
  // Only mixed namespaces carrying the build-time proof allocate these.
  const barriers = independentColors && new Set(independentColors[0].split(' '))
  const independent = independentColors && new Set(independentColors[1].split(' '))
  const isAmbient = (key: string) => Object.hasOwn(ambient, key)
  // Checked once per map: most never write an inline family both ways, and
  // then no class string can, so none is scanned. Only ranked maps: an
  // unranked one keeps its written order and Yoga's own precedence.
  const edges =
    ranks !== undefined &&
    mixedInlineEdges([
      ...Object.values(styles),
      ...Object.values(states).flatMap((groups) => groups.map((group) => group[1])),
    ]).length > 0
  const rtl = Boolean(ambient.rtl)
  const stringEdges = (entries: readonly { style: StyleObject }[], raw: readonly StyleObject[]) =>
    edges ? mixedInlineEdges([...raw, ...entries.map((entry) => entry.style)]) : undefined
  const project = (list: StyleObject[], resolved: { edges?: readonly InlineFamily[] }) =>
    projectInlineEdges(list, resolved.edges, rtl)
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
    const resting: RankedEntry[] | undefined = ranks ? [] : undefined
    const groups: RankedEntry[] = []
    const stateClasses: string[] = []
    const decided: RankedEntry[] = []
    // A compact plan orders all writes together; an unassessed object
    // without a disjointness proof keeps the existing selection tiers.
    let ranked: RankedEntry[] | undefined = ranks ? [] : undefined
    let canKeepRanks = independent !== undefined
    let restingHolesDisjoint = canKeepRanks
    let hasUnrankedState = false
    let colors: TemplateEntry[] | undefined
    const rankFor = (name: string, index: number) => {
      const rank = ranks?.[name]?.[index]
      if (rank !== undefined && (!Number.isSafeInteger(rank) || rank < 0))
        throw new Error('Invalid Hozo class plan rank')
      return rank
    }
    const take = ranks
      ? (entry: RankedEntry) => {
          if (!ranked) return
          if (entry.rank === undefined) {
            if (canKeepRanks && barriers?.has(entry.name)) {
              // Their colours still compete in fallback order. The ranked
              // entries are only independent of these writes, not of one another.
              ;(colors ??= []).push(entry)
            } else ranked = undefined
            return
          }
          if (canKeepRanks && !independent?.has(entry.name)) canKeepRanks = false
          ranked.push(entry)
        }
      : undefined
    for (const name of value.split(/\s+/)) {
      if (name === '') {
        continue
      }
      const style = styles[name]
      if (style) {
        if (resting) {
          const rank = rankFor(name, 0)
          const entry = { name, keys: [], style, ownerRank: undefined, rank }
          resting.push(entry)
          if (restingHolesDisjoint && !(rank === undefined ? barriers : independent)?.has(name))
            restingHolesDisjoint = false
          take?.(entry)
        } else base.push(style)
        continue
      }
      const conditional = states[name]
      if (conditional) {
        let needsState = false
        for (let index = 0; index < conditional.length; index++) {
          const group = conditional[index]!
          const rank = rankFor(name, index)
          const entry = {
            name,
            keys: group[0],
            style: group[1],
            ownerRank: group[2],
            rank,
          }
          take?.(entry)
          if ((negativePredicates?.get(entry.keys)?.keys ?? entry.keys).every(isAmbient)) {
            if (matches(entry.keys, name, ambient)) decided.push(entry)
            continue
          }
          groups.push(entry)
          if (rank === undefined) {
            hasUnrankedState = true
            if (stateColors && !stateColors.has(name))
              throw new Error('Invalid Hozo class plan state rank')
          }
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
    if (ranked && (!colors || canKeepRanks)) {
      // Stable ties keep input order. Cache the selected entry order; hot
      // state changes only test guards, never read or sort priorities.
      ranked.sort((a, b) => a.rank! - b.rank!)
      const ordered: TemplateEntry[] = colors ?? []
      for (const entry of ranked) {
        if ((negativePredicates?.get(entry.keys)?.keys ?? entry.keys).every(isAmbient)) {
          if (matches(entry.keys, entry.name, ambient)) ordered.push({ ...entry, keys: [] })
        } else ordered.push(entry)
      }
      const raw = ordered.filter((entry) => !entry.keys.length).map((entry) => entry.style)
      const edges = stringEdges(ordered, [])
      return {
        base: projectInlineEdges(compose ? compose(raw) : raw, edges, rtl),
        raw,
        edges,
        stateClasses,
        template: groups.length ? { entries: ordered, appendToBase: false } : undefined,
      }
    }
    // The selected tier (not the whole map) can already have exact CSS
    // priorities. Use Native weights only when there is a real hole.
    const sharedTier = ranks !== undefined && (!hasUnrankedState || stateColors !== undefined)
    // Native can linearize known selector weights, but it must not order
    // unknown weights by pretending they have zero specificity.
    if (
      !sharedTier &&
      groups.length > 1 &&
      groups.every((group) => group.ownerRank !== undefined) &&
      groups.some((group, index) => index > 0 && groups[index - 1]!.ownerRank! > group.ownerRank!)
    ) {
      groups.sort((a, b) => a.ownerRank! - b.ownerRank!)
    }
    if (ranks) {
      // Ambient guards have already been evaluated. They keep their
      // resting tier, but it must not throw away known Tailwind order.
      orderRankedRuns(decided, true, false)
      orderRankedRuns(groups, sharedTier, stateColors !== undefined)
    }
    if (resting) {
      orderRestingRuns(resting, barriers, independent, restingHolesDisjoint)
      for (const { style } of resting) base.push(style)
    }
    for (const { style } of decided) base.push(style)
    const edges = stringEdges(groups, base)
    return {
      base: projectInlineEdges(compose ? compose(base) : base, edges, rtl),
      raw: base,
      edges,
      stateClasses,
      template: groups.length ? { entries: groups, appendToBase: true } : undefined,
    }
  }

  function restingWithoutEffects(resolved: Resolved, deferred: number): StyleObject[] {
    const bases = (resolved.deferredBases ??= [])
    return (bases[deferred] ??= project(
      compose ? compose(resolved.raw, deferred) : resolved.raw,
      resolved,
    ))
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
    return project(compose ? compose(all, deferred) : all, resolved)
  }
  return hozoClasses
}
