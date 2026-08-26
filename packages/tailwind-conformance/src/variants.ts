// A denominator for variants, including stacked ones -- and the only
// section that compares *where* a rule applies rather than only what it
// sets.
//
// Two gaps meet here, and they hid each other. Tailwind's `getClassList()`
// enumerates utilities and not the variants in front of them, so no
// derived denominator contains `md:hover:flex`. And every comparison in
// this package matches declaration text, so a rule that lost its `@media`
// wrapper reads as identical to one that kept it. Between the two,
// `md:hover:bg-blue-500` compiled to nothing at all -- for a class people
// write every day -- and nothing in this repository could have said so.
//
// So this section builds the combinations itself and checks three things:
// the declarations, the selector the rule matches, and the at-rules around
// it. The last two are the ones nothing else looks at.

import { compile as hozoCompile } from '@hozo/compiler'
import { classNamesIn, extractRules, type Rule } from './extract.ts'
import { normalize } from './normalize.ts'
import { buildOracle } from './oracle.ts'
import { loadThemeVars } from './theme.ts'

/** The variants Hozo claims to know, plus a few it doesn't. */
const VARIANTS = [
  'hover',
  'focus',
  'disabled',
  'dark',
  'first',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  // Tailwind's own spelling for the ARIA states, which is what Hozo
  // implements rather than a shorter name of its own. Included here so the
  // selector is compared against the one Tailwind actually emits rather
  // than the one it was believed to emit.
  'aria-checked',
  'aria-expanded',
  'aria-selected',
  'aria-busy',
  'aria-disabled',
  'enabled',
  // Relational: the only variants whose selector talks about a *different*
  // element, which is the half of a rule nothing else in this package
  // looks at.
  'group-hover',
  'group-focus',
  'group-aria-checked',
  'group-first',
  'peer-hover',
  'peer-aria-expanded',
  // Environment queries: nothing about the element, one at-rule each --
  // except direction, which is a zero-specificity selector and the reason
  // this group is worth comparing rather than assuming.
  'motion-safe',
  'motion-reduce',
  'portrait',
  'landscape',
  'inverted-colors',
  'ltr',
  'rtl',
  'contrast-more',
  'contrast-less',
  'forced-colors',
  'print',
  'noscript',
  // Direction relates: it is inherited, so an ancestor can differ on it.
  'group-rtl',
  // Negation, which is a selector or a query depending on what it wraps --
  // and both at once for `hover`, which is why `not-hover` is at the end
  // of this list rather than in it twice.
  'not-first',
  'not-aria-checked',
  'not-motion-reduce',
  'not-disabled',
  // Compositional: an attribute, a feature query, and the third relation
  // after group and peer.
  'data-open',
  'data-[state=open]',
  'has-[:focus]',
  'has-hover',
  'supports-[display:grid]',
  // Structural: one pseudo-class each and no runtime state, which makes
  // the argument the only thing to get wrong -- `nth-3` and `nth-[2n+1]`
  // reach the same `:nth-child()` by different spellings, and the
  // `-of-type` family counts a different set of siblings.
  'odd',
  'even',
  'only',
  'empty',
  'nth-3',
  'nth-[2n+1]',
  'first-of-type',
  'nth-last-of-type-3',
  // Neither of these is structural despite sitting beside them: one is a
  // state of the subtree, the other a fact about the URL.
  'focus-within',
  'target',
  // A link the user has been to, and the first frame of a transition. The
  // second is the only variant here whose at-rule is not a query: it nests
  // like `@media` does and composes like it, but `not-`, `has-`, `group-`
  // and `peer-` all refuse it, so the stacked pairs this file builds are
  // where that shows up.
  'visited',
  'starting',
  // Form state. Compiled because Hozo's `TextInput` is a real `<input>`,
  // and reported on anything else -- which is why they are compared here
  // on the `View` this file uses and expected to *match*: the diagnostic
  // is about the element, and the CSS is the same either way.
  'required',
  'invalid',
  'read-only',
  'placeholder-shown',
  'user-invalid',
  'autofill',
  // Pseudo-elements, and the two that are more than one rule each: this
  // section compares rule *counts* as well as their contents, which is
  // what makes `marker:` worth having here rather than in the catalogue.
  'before',
  'after',
  'placeholder',
  'marker',
  'selection',
  'first-letter',
  'file',
  'backdrop',
  // Width thresholds. `min-<bp>` is here to prove it is the *same*
  // condition as the bare breakpoint rather than a second one that
  // happens to agree, and `max-` to check the direction and the unit.
  'min-md',
  'min-[500px]',
  'max-md',
  'max-[40rem]',
  // Container queries. Their breakpoint names are Tailwind's container
  // scale and not the viewport one -- `@sm` is 24rem where `sm` is 40rem
  // -- so a name shared between the two lists is exactly the mistake this
  // section would catch.
  '@sm',
  '@3xl',
  '@min-md',
  '@max-md',
  '@min-[400px]',
  '@sm/main',
  '@max-md/sidebar',
  // The two that move the *styled* element rather than the condition,
  // which is why order matters between them and everything else:
  // `hover:*:` is the children of a hovered element and `*:hover:` is the
  // hovered children. Stacking is what this section is for.
  '*',
  '**',
  // The rest of the interaction family, here so a stacked combination of
  // two implemented variants is compared rather than assumed.
  'last',
  'active',
  'focus-visible',
  // Two rules in Tailwind -- the selector negated, and `@media not
  // (hover: hover)` for a device where nothing is ever hovered. It was
  // the one variant Hozo refused, because a backend could return one
  // shape per condition and this needs two. It returns a list now, which
  // `marker:` forced and this benefited from.
  'not-hover',
]

/**
 * Utilities to put the variants in front of.
 *
 * Three, deliberately: the variant is what is under test, and crossing
 * every variant pair with a large sample would measure the utilities
 * again at hundreds of times the cost.
 */
const UTILITIES = ['flex', 'bg-blue-500', 'p-4']

export interface VariantCase {
  candidate: string
  /** Rules Tailwind produces, as (at-rules, selector suffix, declarations). */
  expected: RuleShape[]
}

export interface VariantCatalog {
  cases: VariantCase[]
  /** Theme values plus Tailwind's `@property` register defaults. */
  vars: Map<string, string>
}

export interface RuleShape {
  atRules: string[]
  /** The selector with the class name itself removed: `:hover:first-child`. */
  suffix: string
  declarations: string
}

export interface VariantVerdict {
  candidate: string
  verdict: 'MATCH' | 'MISMATCH' | 'UNSUPPORTED'
  detail?: string
}

/**
 * Every single and stacked pair, kept if Tailwind generates a rule.
 *
 * `variants` is a parameter so a subset can be checked on its own. The
 * full list is twenty-odd minutes of Tailwind compiling twenty thousand
 * candidates, which is the right cost for CI and the wrong one for asking
 * whether a handful of entries behave.
 */
export async function buildVariantCatalog(
  variants: readonly string[] = VARIANTS,
): Promise<VariantCatalog> {
  const candidates: string[] = []
  for (const utility of UTILITIES) {
    for (const one of variants) {
      candidates.push(`${one}:${utility}`)
      for (const two of variants) {
        if (one === two) continue
        candidates.push(`${one}:${two}:${utility}`)
      }
    }
  }

  const oracle = await buildOracle(candidates)
  const rulesByClass = indexByClassName(oracle.css)
  const cases: VariantCase[] = []
  // Which variants got at least one case, tracked here rather than parsed
  // back out of the candidate strings -- `has-[:focus]` has a colon inside
  // its brackets, so splitting on colons finds the wrong name for exactly
  // the entries this is watching.
  const covered = new Set<string>()
  for (const utility of UTILITIES) {
    for (const one of variants) {
      for (const [candidate, names] of [
        [`${one}:${utility}`, [one]] as const,
        ...variants.filter((two) => two !== one).map(
          (two) => [`${one}:${two}:${utility}`, [one, two]] as const,
        ),
      ]) {
        const bucket = rulesByClass.get(cssClassName(candidate)) ?? []
        const shapes = toShapes(bucket, new RegExp(`\\.${classNamePattern(candidate)}(?![\\w-])`))
        if (shapes.length === 0) continue
        cases.push({ candidate, expected: shapes })
        for (const name of names) covered.add(name)
      }
    }
  }

  // A variant that produced nothing at all is not a gap in Hozo -- it is a
  // gap in this file. It means Tailwind emitted no rule the search could
  // find, and the search is the part more likely to be wrong: a candidate
  // that finds no rule is dropped for producing none, so the count goes
  // down and nothing says so.
  //
  // That is not hypothetical. Nine of these were missing at once, every
  // one with a bracket in its name, because the class name was escaped for
  // CSS and then used as a regex -- see `classNamePattern`. The totals
  // this section reported were correct about everything it looked at and
  // silent about what it had stopped looking at.
  const missing = variants.filter((name) => !covered.has(name))
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} variant(s) in this file produced no case at all: ` +
        `${missing.join(' ')}\nTailwind emitted no rule for them, or the search for it is ` +
        `wrong. Either way the denominator is smaller than it looks.`,
    )
  }

  return { cases, vars: new Map([...loadThemeVars(), ...oracle.registerDefaults]) }
}

/**
 * A selector suffix with Hozo's one deliberate substitution undone.
 *
 * `disabled:` compiles to `[data-hozo-disabled]` rather than `:disabled`,
 * because `:disabled` matches form controls and a `Pressable` is a `<div>`
 * -- so the Tailwind class produced a rule that could never apply. The
 * decision and its reasoning are in `docs/decisions/001-disabled-and-focus.md`
 * and at the mapping in `crates/hozo_web/src/css.rs`.
 *
 * Folded here rather than left to show as a mismatch on every stacked
 * `disabled:` combination. A comparison that reports a difference someone
 * chose, every run, is one people learn to skim -- and this file exists to
 * be read. Specificity is identical either way, which is what makes the
 * substitution invisible to everything except the element it now reaches.
 */
function canonicalSuffix(suffix: string): string {
  return (
    suffix
      // First, because it is a spelling and the folds below are meanings.
      // CSS nesting inserts an implicit universal selector: Tailwind
      // writes `not-first:` as `:not(:first-child)` at the top level and
      // `:not(*:first-child)` inside a nested rule, and likewise
      // `:has(*:hover)`, `:not(*[aria-checked="true"])` and
      // `&::before *::marker`. `*` adds nothing to the match and nothing
      // to the specificity. Leaving it until last meant `:not(*:disabled)`
      // never reached the `:enabled` fold below.
      .replace(/(^|[\s(])\*(?=[:[])/g, '$1')
      .replace(':not([data-hozo-disabled])', ':enabled')
      .replace('[data-hozo-disabled]', ':disabled')
      // Both sides, because the substitution shows up twice over: Tailwind
      // writes `enabled:` as `:enabled` and `not-disabled:` as
      // `:not(:disabled)`, which are the same set said two ways. Folding
      // only Hozo's side made the second one look like a difference.
      .replace(':not(:disabled)', ':enabled')
  )
}

export function compareVariant(entry: VariantCase, vars: Map<string, string>): VariantVerdict {
  const source =
    `import { View } from '@hozo/core'\n` +
    `const el = <View className="${entry.candidate}" />\n`
  const [compiled] = hozoCompile(source)
  const actual = compiled ? shapesFor(compiled.css, /\.hozo-\d+/.source, true) : []
  if (actual.length === 0) {
    return { candidate: entry.candidate, verdict: 'UNSUPPORTED' }
  }

  const differences: string[] = []
  for (const [index, want] of entry.expected.entries()) {
    const got = actual[index]
    if (!got) {
      differences.push(`missing rule ${index + 1}`)
      continue
    }
    if (canonicalSuffix(want.suffix) !== canonicalSuffix(got.suffix)) {
      differences.push(`selector: expected \`&${want.suffix}\`, got \`&${got.suffix}\``)
    }
    const wantAt = want.atRules.map(canonicalAtRule).join(' ')
    const gotAt = got.atRules.map(canonicalAtRule).join(' ')
    if (wantAt !== gotAt) {
      differences.push(`at-rules: expected \`${wantAt || '(none)'}\`, got \`${gotAt || '(none)'}\``)
    }
    const wantDecl = declarationText(want.declarations, vars)
    const gotDecl = declarationText(got.declarations, vars)
    if (wantDecl !== gotDecl) {
      differences.push(`declarations: expected \`${wantDecl}\`, got \`${gotDecl}\``)
    }
  }
  if (actual.length > entry.expected.length) {
    differences.push(`${actual.length - entry.expected.length} rule(s) more than Tailwind emits`)
  }
  return differences.length === 0
    ? { candidate: entry.candidate, verdict: 'MATCH' }
    : { candidate: entry.candidate, verdict: 'MISMATCH', detail: differences.join('; ') }
}

/**
 * `48rem` and `768px` are the same width written two ways.
 *
 * Only the unit now. Hozo wrote `(min-width: 768px)` against Tailwind's
 * `(width >= 48rem)` until `max-…:` arrived and the old spelling turned
 * out to have no exact opposite -- `(max-width: 767.98px)` is a
 * convention, not an equivalent. Both sides use the range syntax now, so
 * what is left to fold is the unit, and rem resolves against a root font
 * size the browser fixes at 16px.
 *
 * Rewritten rather than accepted as a difference: it is a spelling, and
 * leaving it in place would drown every real one.
 */
function canonicalAtRule(rule: string): string {
  return rule
    .replace(/([\d.]+)rem/g, (_, rem: string) => `${parseFloat(rem) * 16}px`)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A rule's declarations, resolved and sorted.
 *
 * Through the shared normalizer rather than a local split, so a theme
 * token resolves the same way it does everywhere else -- comparing the raw
 * text put `var(--color-blue-500)` against the `oklch()` Hozo writes and
 * called every coloured utility a mismatch.
 */
function declarationText(declarations: string, vars: Map<string, string>): string {
  const { declarations: resolved } = normalize(declarations, vars)
  return [...resolved]
    .map(([property, value]) => `${property}: ${value}`)
    .sort()
    .join('; ')
}

/**
 * Every rule targeting `className`, as shapes.
 *
 * The `@layer` wrapper is dropped: both sides put their utilities in one,
 * and it says nothing about where the rule applies.
 */
function shapesFor(css: string, className: string, isPattern = false): RuleShape[] {
  const target = isPattern ? new RegExp(className) : new RegExp(`\\.${className}(?![\\w-])`)
  return toShapes(extractRules(css), target)
}

function toShapes(rules: readonly Rule[], target: RegExp): RuleShape[] {
  const shapes: RuleShape[] = []
  for (const rule of rules) {
    if (!target.test(rule.selector)) continue
    // The base `.hozo-view` rule is View's own semantics, not this
    // candidate's.
    if (rule.selector === '.hozo-view') continue
    shapes.push({
      atRules: rule.atRules.filter((at) => !at.startsWith('@layer')),
      suffix: rule.selector.replace(target, '&').replace(/^&/, ''),
      declarations: rule.declarations,
    })
  }
  return shapes
}

/**
 * The oracle's rules, bucketed by the class names they target.
 *
 * Built once, because the alternative was quadratic and this section is
 * big enough for that to be the whole cost of the audit. `shapesFor`
 * parses the stylesheet and then scans every rule in it, and
 * `buildVariantCatalog` called it once per candidate -- 23232 of them
 * against a stylesheet holding a rule for each. Two nested loops over the
 * same number, and the report spent 98% of its 41 minutes here.
 *
 * A rule lands in a bucket per class name in its selector, in the order
 * the stylesheet gives them, so a bucket is the same list the scan used
 * to find -- the shapes come out in the same order and say the same
 * thing. The candidate's own regex still runs, on its bucket rather than
 * on all 23232 rules, because the suffix is computed from it.
 */
function indexByClassName(css: string): Map<string, Rule[]> {
  const index = new Map<string, Rule[]>()
  for (const rule of extractRules(css)) {
    for (const name of classNamesIn(rule.selector)) {
      const bucket = index.get(name)
      if (bucket) bucket.push(rule)
      else index.set(name, [rule])
    }
  }
  return index
}

/**
 * How Tailwind escapes a candidate when writing it as a CSS selector.
 *
 * `hover:flex` becomes `hover\:flex`. One backslash, because that is what
 * is in the stylesheet.
 */
export function cssClassName(candidate: string): string {
  return candidate.replace(/[^\w-]/g, (ch) => (ch.charCodeAt(0) > 127 ? ch : `\\${ch}`))
}

/**
 * That name again, as a pattern that matches it and nothing else.
 *
 * Two escapings, and they were one function until it silently emptied a
 * ninth of this section's denominator. A single pass emitting `\\` before
 * each special character happens to work as a regex for `:` and `@` --
 * `\\` is a literal backslash and the character follows it plainly -- and
 * quietly does something else for the characters that mean something to a
 * regex. `\\[` opens a character class. `\\*` and `\\+` are quantifiers on
 * the backslash.
 *
 * So every candidate with a bracket found no rule, was dropped from the
 * catalogue for producing none, and was counted as nothing rather than as
 * a gap: `data-[state=open]`, `has-[:focus]`, `supports-[display:grid]`,
 * `nth-[2n+1]`, `min-[500px]`, `max-[40rem]`, `@min-[400px]`, and `*` and
 * `**` besides. Nine variants this file lists, verified by a number that
 * never included them.
 *
 * The escapes are separate now because they are answers to different
 * questions: what does the stylesheet contain, and how do I look for it.
 */
export function classNamePattern(candidate: string): string {
  return cssClassName(candidate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
