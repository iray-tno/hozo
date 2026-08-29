// The candidate stylesheet as a whole, rather than one rule at a time.
//
// Everything else in this package asks about a single utility: does Hozo's
// CSS for `2xl:block` say what Tailwind's does. Two defects shipped under
// a green audit in the same week because neither is a question about one
// utility:
//
//   - `.2xl\:block` is not a selector. CSS cannot begin an identifier with
//     a digit, so it matched nothing in a browser and a minifier refused
//     it outright. The per-utility comparison never saw it, because only
//     this stylesheet spells a Tailwind class name -- a class the compiler
//     reads statically becomes `hozo-N`, and the variant section compiles
//     `<View className="2xl:block" />` and reads `.hozo-0` back.
//
//   - The rules were in alphabetical order. Every utility here is a single
//     class, so they all carry the same specificity and the order they are
//     written in *is* the cascade; alphabetical puts `2xl:` first and
//     `sm:` after `md:`, so `hidden sm:block md:hidden` stayed visible
//     past `md`. Order is a property of a *set* of rules, and a check that
//     looks at one candidate has nowhere to put the question.
//
// So: hand the whole sheet to a real CSS parser, and compare the sequence
// it writes against the sequence Tailwind writes. Neither check carries an
// expectation of its own -- one is a parser, the other is Tailwind.

import { transform } from 'lightningcss'

import { classNamesIn, extractRules } from './extract.ts'
import { cssClassName } from './variants.ts'

export interface SheetReport {
  /** What the parser said, or `undefined` when it accepted the sheet. */
  parseError: string | undefined
  rules: number
  /** Candidates both sheets write, which is what order can be asked of. */
  comparable: number
  /** How many sit in the same position in both. */
  inOrder: number
  /** The first place the two sequences part company. */
  firstDivergence: string | undefined
}

/**
 * Each candidate's first appearance, in one pass.
 *
 * By the escaped class name rather than by parsing selectors back into
 * candidates: `.hover\:bg-red-500:hover` is not a candidate called
 * `hover:bg-red-500:hover`, and `.\32 xl\:block` does not end at the space
 * inside its escape. Reading it the other way round -- what does *this*
 * candidate look like, and where does that first appear -- has no such
 * cases.
 *
 * Indexed rather than searched. `indexOf` per candidate over a 2.5MB sheet
 * is twenty-three thousand scans of it, which took 38 seconds; this is one
 * walk of the rules and a map lookup each.
 */
function sequenceOf(css: string, byClassName: Map<string, string>): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const rule of extractRules(css)) {
    for (const escaped of classNamesIn(rule.selector)) {
      const candidate = byClassName.get(escaped)
      if (candidate === undefined || seen.has(candidate)) continue
      seen.add(candidate)
      order.push(candidate)
    }
  }
  return order
}

/**
 * Checks one rendered candidate stylesheet against Tailwind's own.
 *
 * `css` is what `CandidateCache.renderCss` produced for `candidates`, and
 * `oracleCss` is the whole stylesheet Tailwind produced for the same set --
 * passed in rather than built here, because the caller already has one and
 * compiling twenty-three thousand candidates twice is the expensive half
 * of this package.
 */
export function compareCandidateSheet(
  css: string,
  oracleCss: string,
  candidates: readonly string[],
): SheetReport {
  let parseError: string | undefined
  try {
    // Minified, because that is the pass that first refused the bad
    // selector. A browser drops a rule it cannot read and says nothing;
    // this says what and where.
    transform({ filename: 'candidates.css', code: Buffer.from(css), minify: true })
  } catch (error) {
    parseError = (error as Error).message.split('\n')[0]
  }

  const byClassName = new Map(candidates.map((name) => [cssClassName(name), name]))
  const ours = sequenceOf(css, byClassName)
  const theirs = sequenceOf(oracleCss, byClassName)

  // Only what both sheets contain. A candidate Hozo does not support, or
  // one Tailwind emits nothing for, is a question the other sections ask.
  // Through sets, because `includes` inside a filter over twenty-three
  // thousand entries is the same quadratic mistake in a smaller coat.
  const ourNames = new Set(ours)
  const theirNames = new Set(theirs)
  const mine = ours.filter((name) => theirNames.has(name))
  const right = theirs.filter((name) => ourNames.has(name))

  let inOrder = 0
  let firstDivergence: string | undefined
  for (const [index, name] of right.entries()) {
    if (mine[index] === name) {
      inOrder += 1
      continue
    }
    firstDivergence ??=
      `position ${index}: Tailwind writes \`${name}\`, Hozo writes \`${mine[index] ?? '(nothing)'}\``
  }

  return {
    parseError,
    rules: extractRules(css).filter((rule) => classNamesIn(rule.selector).length > 0).length,
    comparable: right.length,
    inOrder,
    firstDivergence,
  }
}
