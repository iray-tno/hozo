// How much of the CSS Hozo writes is the same declaration again.
//
// Hozo writes a self-contained rule per element: two components carrying
// the same classes emit the same declarations twice, and only the
// primitive bases like `.hozo-view` are shared. Atomic CSS -- one class
// per declaration, reused everywhere -- is the known answer, and it is the
// part of StyleX worth stealing whether or not Hozo ever reads StyleX.
//
// The reason not to just do it is that the cost is certain and the benefit
// is not: atomic trades readable class names for unreadable ones and makes
// a devtools panel harder to reason about. This measures the benefit so
// the trade can be made with a number rather than a preference. See #4.
//
// Two things an honest measurement has to do, because both flatter atomic
// if skipped:
//
//   - **Count where the bytes go, not only where they leave.** One class
//     per declaration means an element's `class` attribute grows from one
//     name to as many names as it has declarations, and that lands in the
//     bundle. The stylesheet shrinking is half the story.
//
//   - **Compress the files as they ship.** A stylesheet and a bundle are
//     two responses, compressed separately. Concatenating them first lets
//     one side's repetition pay for the other's, which is a discount
//     nothing in production gives.

import { extractRules } from './extract.ts'

/** One declaration in one context, and the class an atomic scheme gives it. */
export interface Atoms {
  /** Generated class name -> the atom names it stands for. */
  atomsFor: Map<string, string[]>
  /** The stylesheet those atoms would need. */
  css: string
  /** `property: value` pairs across every rule, counted with repeats. */
  declarations: number
  /** How many are distinct, in the same at-rule and selector context. */
  distinct: number
  rules: number
}

/** The class name a rule is about, and the context its declarations sit in. */
function ruleParts(selector: string, atRules: readonly string[]) {
  const match = /\.((?:\\.|[\w-])+)/.exec(selector)
  const name = match ? match[1].replace(/\\(.)/g, '$1') : undefined
  // A `:hover` branch is a different atom from the base rule, and a
  // descendant form (`:where(.x > :not(:last-child))`) different again --
  // an atomic scheme needs a separate class for each, so they cannot be
  // counted as the same declaration.
  const suffix = match ? selector.replace(match[0], '&') : selector
  return { name, suffix, context: [...atRules, suffix].join(' && ') }
}

/**
 * Takes a corpus's stylesheets apart into atoms.
 *
 * The atom names are the shortest thing that could work -- base-36
 * counters. That is the most favourable case for atomic, and therefore the
 * honest one to compare against: if it does not win here it does not win.
 */
export function atomise(css: string): Atoms {
  const atomsFor = new Map<string, string[]>()
  const names = new Map<string, string>()
  const rules = extractRules(css)
  let atomicCss = ''
  let declarations = 0

  for (const rule of rules) {
    const { name, suffix, context } = ruleParts(rule.selector, rule.atRules)
    if (name === undefined) continue
    const list = atomsFor.get(name) ?? []
    for (const text of rule.declarations
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)) {
      declarations += 1
      const atom = `${context}|${text}`
      let atomName = names.get(atom)
      if (atomName === undefined) {
        atomName = `h${names.size.toString(36)}`
        names.set(atom, atomName)
        const body = `.${atomName}${suffix.replace('&', '')} { ${text}; }`
        atomicCss += rule.atRules.reduceRight((inner, at) => `${at} { ${inner} }`, body) + '\n'
      }
      list.push(atomName)
    }
    atomsFor.set(name, list)
  }

  return { atomsFor, css: atomicCss, declarations, distinct: names.size, rules: rules.length }
}

/**
 * Rewrites one `class` attribute value into the atoms it stands for.
 *
 * A name with no rule of its own -- `hozo-view` and the other shared
 * bases -- is carried through unchanged, because an atomic scheme would
 * keep it too.
 */
export function substituteClasses(attribute: string, atomsFor: Map<string, string[]>): string {
  return attribute
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((name) => atomsFor.get(name) ?? [name])
    .join(' ')
}
