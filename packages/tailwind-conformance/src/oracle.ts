// Wraps the real Tailwind engine as a correctness oracle: given a list of
// candidate class names it returns exactly the CSS each one should produce.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compile } from 'tailwindcss'
import { classNamesIn, extractRules, type Rule } from './extract.ts'
import { tailwindPackageDir } from './theme.ts'
import { cssClassName } from './variants.ts'

export type OracleRules = Map<string, string>

export interface Oracle {
  /**
   * The whole compiled stylesheet.
   *
   * `rules` throws away the selectors and the at-rules around them, which
   * is all most of the report needs and none of what `variants.ts` needs.
   */
  css: string
  rules: OracleRules
  /**
   * Initial values of the `--tw-*` registers Tailwind declares via
   * `@property`. Its utilities reference these without a fallback (e.g.
   * `box-shadow: var(--tw-ring-shadow), var(--tw-shadow)`), so resolving
   * one needs them -- read from the compiled output rather than hardcoded
   * so they can't drift from the version under test.
   */
  registerDefaults: Map<string, string>
}

/** Compiles `candidates` and returns each one's declaration block. */
/**
 * Rules at the shallowest at-rule depth *for each class*.
 *
 * The same rule `compare.ts` applies to Hozo's side, and it has to be
 * applied to both or the comparison is between different things. It used
 * to hold by accident: `extractRules` dropped the declarations inside a
 * nested `@media`, so `outline-hidden`'s forced-colours branch never
 * reached this function. Teaching the extractor to read CSS nesting --
 * which it had to learn for `before:md:flex` -- made those declarations
 * visible, and they arrived on one side only.
 *
 * Per class rather than globally, because one build holds every candidate
 * and a responsive one is legitimately deeper than a plain one.
 */
function leastConditional(rules: Rule[]): Rule[] {
  const depth = new Map<string, number>()
  for (const rule of rules) {
    for (const name of classNamesIn(rule.selector)) {
      const current = depth.get(name)
      if (current === undefined || rule.atRules.length < current) {
        depth.set(name, rule.atRules.length)
      }
    }
  }
  return rules.filter((rule) =>
    classNamesIn(rule.selector).some((name) => depth.get(name) === rule.atRules.length),
  )
}

export async function buildOracle(candidates: string[]): Promise<Oracle> {
  const dir = tailwindPackageDir()
  const compiler = await compile('@import "tailwindcss";', {
    base: dir,
    loadStylesheet: async (id: string) => {
      const file = id === 'tailwindcss' ? path.join(dir, 'index.css') : id
      return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
    },
  })

  const css = compiler.build(candidates)
  const utilities = css.slice(css.indexOf('@layer utilities'))

  const rules: OracleRules = new Map()
  const byName = new Map(candidates.map((c) => [cssClassName(c), c]))

  for (const { selector, declarations } of leastConditional(extractRules(utilities))) {
    // Read the class names *out of* the selector and look each one up,
    // rather than testing every candidate against every selector. The
    // latter is fine for a hand-picked hundred and quadratic against the
    // full ~23k catalogue, where it is tens of millions of string scans.
    //
    // A selector may carry a pseudo-class or be a descendant form
    // (`:where(.space-x-2 > :not(:last-child))`), so every class in it is
    // considered, not just a whole-selector match.
    for (const escaped of classNamesIn(selector)) {
      const candidate = byName.get(escaped)
      if (candidate === undefined) continue
      rules.set(candidate, (rules.get(candidate) ?? '') + declarations)
    }
  }
  return { css: utilities, rules, registerDefaults: extractRegisterDefaults(css) }
}

function extractRegisterDefaults(css: string): Map<string, string> {
  const defaults = new Map<string, string>()
  const re = /@property\s+(--[a-z0-9-]+)\s*\{([^}]*)\}/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(css))) {
    const initial = /initial-value:\s*([^;]+);/i.exec(match[2])
    if (initial) defaults.set(match[1], initial[1].trim())
  }
  return defaults
}

// How Tailwind escapes a candidate when writing it as a CSS selector used
// to live here as well, byte for byte, and the two copies were wrong
// together: the same hole had to be found twice or it was only half
// closed. `cssClassName` in `variants.ts` is the one, and its comment
// carries what the three wrong versions taught.
