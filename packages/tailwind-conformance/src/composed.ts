// The composition denominator, derived instead of written.
//
// `compositions.ts` says it plainly: its list is hand-written, "and that
// is a real weakness -- a combination nobody thought of is a combination
// nobody measures. It is bounded by what can be derived: there is no
// enumeration of utility pairs that interact."
//
// There is. Tailwind builds these families out of custom properties, and
// which utility writes a register and which one reads it is written down
// in the CSS it emits. `ring-blue-500` sets `--tw-ring-color`; `ring-2`
// puts `var(--tw-ring-color)` into a `box-shadow`. Nobody has to decide
// that those two belong together -- the stylesheet already says so.
//
// The gap this fills is the largest one left in the report. Of the 23286
// entries in the full catalogue, 3006 paint nothing standalone and leave
// the denominator for it. `ring-*` scores 6 out of 594, `shadow-*` 10 out
// of 302, `drop-shadow-*` 7 out of 298, and `from-*`, `via-*` and `to-*`
// score zero out of 937 between them -- each of those a true verdict
// about a family nothing was measuring. Fifty hand-written combinations
// stood in for all of it.
//
// This does not replace those fifty. A derived pair asks whether a
// producer reaches its consumer; the hand-written list asks what happens
// when several producers interfere with each other -- a middle gradient
// stop, a colour written twice, an interpolation modifier -- and there is
// nothing in the stylesheet to derive those from. The two sections
// measure different things and both are reported.

import { loadFullCatalog } from './catalog.ts'
import { buildOracle } from './oracle.ts'

/**
 * A read is `var(--tw-x)`, not the name appearing anywhere.
 *
 * Tailwind's `transition` lists every animatable property in
 * `transition-property`, the gradient registers among them. A pattern that
 * matched the bare name made `transition` the nearest consumer of every
 * gradient stop in the catalogue -- a pairing that compiles, produces
 * output, and measures nothing.
 */
const REGISTER = /var\(\s*(--tw-[\w-]+)/g

/** Function calls in a value, which is what tells two shapes apart. */
const FUNCTION = /([\w-]+)\(/g

interface Rule {
  candidate: string
  /** The `--tw-*` registers this rule writes. */
  sets: Set<string>
  /** The ones it reads. */
  reads: Set<string>
  /** Whether it puts anything into a real CSS property. */
  paints: boolean
  /**
   * What this rule does, with its values erased.
   *
   * Two rules share a shape when they set the same properties, call the
   * same functions and read the same registers. `bg-linear-to-r` and
   * `bg-linear-45` are one shape -- an angle is a value. `bg-radial` is
   * another, because `radial-gradient` is not `linear-gradient`.
   *
   * Derived from the emitted CSS rather than from the name, because the
   * name is not reliable about this: `bg-linear-to-r` and `bg-radial`
   * share a prefix and differ in structure, while `shadow-lg` and
   * `shadow-xs` share nothing but a prefix and are the same shape.
   */
  shape: string
}

function read(candidate: string, block: string): Rule {
  const sets = new Set<string>()
  const reads = new Set<string>()
  const properties: string[] = []
  const functions: string[] = []
  let paints = false
  for (const declaration of block.split(';')) {
    const at = declaration.indexOf(':')
    if (at === -1) continue
    const property = declaration.slice(0, at).trim()
    const value = declaration.slice(at + 1)
    if (property.startsWith('--tw-')) sets.add(property)
    else if (!property.startsWith('--')) paints = true
    properties.push(property)
    for (const [, name] of value.matchAll(REGISTER)) reads.add(name)
    for (const [, name] of value.matchAll(FUNCTION)) if (name !== 'var') functions.push(name)
  }
  const shape = `${properties.join(',')}|${functions.join(',')}|${[...reads].sort().join(',')}`
  return { candidate, sets, reads, paints, shape }
}

/** The shortest name, then alphabetical, so the choice never drifts. */
function cheapest(rules: Rule[]): Rule {
  return [...rules].sort(
    (a, b) => a.candidate.length - b.candidate.length || a.candidate.localeCompare(b.candidate),
  )[0]
}

/** One representative per shape. */
function perShape(rules: Rule[]): Rule[] {
  const byShape = new Map<string, Rule>()
  for (const rule of rules) {
    const seen = byShape.get(rule.shape)
    if (!seen || rule.candidate.length < seen.candidate.length) byShape.set(rule.shape, rule)
  }
  return [...byShape.values()]
}

export interface ComposedCatalog {
  candidates: string[]
  expected: Map<string, string>
  registerDefaults: Map<string, string>
  /** Producers with no consumer at all, which would be a hole in this. */
  unreachable: string[]
  counts: { producers: number; consumers: number; value: number; structure: number }
}

export async function buildComposedCatalog(): Promise<ComposedCatalog> {
  const oracle = await buildOracle(await loadFullCatalog())
  const rules = [...oracle.rules].map(([candidate, block]) => read(candidate, block))
  const producers = rules.filter((rule) => !rule.paints && rule.sets.size > 0)
  const consumers = rules.filter((rule) => rule.paints && rule.reads.size > 0)
  const painting = new Set(consumers)

  // Every rule that reads a register, painting or not. A register's only
  // reader is often another producer: `ring-offset-blue-500` writes
  // `--tw-ring-offset-color`, which `ring-offset-2` reads -- and that
  // paints nothing either, it writes `--tw-ring-offset-shadow`, which
  // `ring-2` finally puts into a `box-shadow`. Three utilities, and the
  // walk below is what finds that out rather than someone knowing it.
  const readers = new Map<string, Rule[]>()
  for (const rule of rules) {
    for (const name of rule.reads) {
      const list = readers.get(name)
      if (list) list.push(rule)
      else readers.set(name, [rule])
    }
  }

  /**
   * The shortest chain from a producer to a painted declaration.
   *
   * Breadth-first, so a producer one register away from paint gets a pair
   * and only the ones that genuinely need a third utility get three.
   */
  function chainFor(producer: Rule): string[] | null {
    const seen = new Set([producer.candidate])
    let frontier: { rule: Rule; path: string[] }[] = [{ rule: producer, path: [] }]
    for (let depth = 0; depth < 4; depth += 1) {
      const next: { rule: Rule; path: string[] }[] = []
      for (const { rule, path } of frontier) {
        for (const name of rule.sets) {
          const here = (readers.get(name) ?? []).filter((other) => painting.has(other))
          if (here.length > 0) return [cheapest(here).candidate, ...path, producer.candidate]
          for (const via of readers.get(name) ?? []) {
            if (seen.has(via.candidate)) continue
            seen.add(via.candidate)
            next.push({ rule: via, path: [via.candidate, ...path] })
          }
        }
      }
      frontier = next
      if (frontier.length === 0) break
    }
    return null
  }

  // Two coverages, taken separately rather than as a product.
  //
  // Crossing every producer with every consumer shape comes to 239930
  // combinations, and most of them measure the same thing repeatedly:
  // `from-amber-50` through `from-red-950` is one code path, and pairing
  // each of them with each gradient constructor asks the same question
  // three hundred times.
  //
  // The value axis is every producer once, against the cheapest consumer
  // that reaches it. That is where a wrong colour or a wrong length shows
  // up, and it needs every value but only one consumer.
  //
  // The structure axis is every producer *shape* against every consumer
  // shape that reads a register it writes. That is where a register
  // reaching the wrong declaration shows up, and it needs every shape but
  // only one value.
  //
  // The consumer has to read a register the producer writes *itself* --
  // not one three hops away. The walk above is what establishes that a
  // producer is reachable at all; it is not what makes two rules a
  // structural pair, and using it for both crossed things that never meet.
  const combinations = new Set<string>()
  const unreachable: string[] = []
  let value = 0
  for (const producer of producers) {
    const chain = chainFor(producer)
    if (!chain) {
      unreachable.push(producer.candidate)
      continue
    }
    if (!combinations.has(chain.join(' '))) value += 1
    combinations.add(chain.join(' '))
  }

  const before = combinations.size
  for (const producer of perShape(producers)) {
    for (const name of producer.sets) {
      const here = (readers.get(name) ?? []).filter((other) => painting.has(other))
      for (const consumer of perShape(here)) {
        combinations.add(`${consumer.candidate} ${producer.candidate}`)
      }
    }
  }

  const candidates = [...combinations].sort()
  // Tailwind's emission order decides the winner between two declarations
  // of equal specificity. The order in the attribute is not it.
  const order = new Map([...oracle.rules.keys()].map((name, index) => [name, index]))
  const expected = new Map<string, string>()
  for (const combination of candidates) {
    expected.set(
      combination,
      combination
        .split(' ')
        .filter((name) => oracle.rules.has(name))
        .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
        .map((name) => oracle.rules.get(name)!)
        .join(''),
    )
  }

  return {
    candidates,
    expected,
    registerDefaults: oracle.registerDefaults,
    unreachable,
    counts: {
      producers: producers.length,
      consumers: consumers.length,
      value,
      structure: combinations.size - before,
    },
  }
}
