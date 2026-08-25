// Pulls `selector { declarations }` pairs out of CSS text.
//
// A brace-matching scan rather than a regex, because Tailwind nests
// at-rules *inside* style rules:
//
//   .bg-linear-to-r {
//     --tw-gradient-position: to right;
//     @supports (background-image: linear-gradient(in lab, red, red)) {
//       --tw-gradient-position: to right in oklab;
//     }
//     background-image: linear-gradient(var(--tw-gradient-stops));
//   }
//
// The regex this replaced required a rule's body to be brace-free, so a
// rule shaped like that matched nothing at all. That is not a rule the
// report got wrong -- it is a rule the report never saw, and a candidate
// the oracle has no CSS for silently leaves the denominator as "Tailwind
// emits nothing for this one". Every gradient direction utility sat
// outside the measurement for exactly that reason.
//
// A nested `@supports` block's declarations are folded into the rule
// containing them, in source order, so the enhanced value wins -- which
// is what Tailwind intends: the outer declaration is the fallback for
// engines without the feature, and the browsers this compiles for have
// it.
//
// Only `@supports`. A nested `@media` is an environment condition rather
// than a capability, and folding one in describes an element that isn't
// the element being compared: `outline-hidden` carries a
// `@media (forced-colors: active)` branch, and counting it made Hozo
// look like it was missing two declarations that only exist when the
// user has turned forced colours on.

export interface Rule {
  selector: string
  declarations: string
  /**
   * The at-rules enclosing this one, outermost first.
   *
   * Recorded because nothing compared them until 2026-08-17: the report
   * matches declaration text, so a rule that lost its `@media` wrapper --
   * or never had one -- read as identical to one that kept it. See
   * `variants.ts`.
   */
  atRules: string[]
}

export function extractRules(css: string): Rule[] {
  const rules: Rule[] = []
  // One frame per open block. `target` is the rule its declarations
  // belong to -- itself for a style rule, the enclosing rule for a
  // nested `@supports`, and nothing for anything else: a top-level
  // at-rule's body is other rules rather than declarations, and a nested
  // conditional's declarations describe a different element state.
  const stack: { target: Rule | null; opened: boolean; foldInto?: Rule }[] = []
  // The at-rule preludes currently open, outermost first. A nested
  // `@supports` folded into its rule is *not* one of these -- it describes
  // the same element, which is why its declarations were folded in the
  // first place.
  const open: string[] = []
  let buffer = ''

  const flush = () => {
    const target = stack.length > 0 ? stack[stack.length - 1].target : null
    if (target) target.declarations += buffer
    buffer = ''
  }

  for (let index = 0; index < css.length; index += 1) {
    const ch = css[index]

    // A brace inside a string is text, not structure. `content-['{']` is
    // rare and entirely legal.
    if (ch === '"' || ch === "'") {
      const end = closingQuote(css, index)
      buffer += css.slice(index, end + 1)
      index = end
      continue
    }

    if (ch === '{') {
      const name = buffer.trim()
      buffer = ''
      const parent = stack.length > 0 ? stack[stack.length - 1].target : null
      if (name.startsWith('@')) {
        // Only *inside* a style rule. A top-level `@supports` is an
        // ordinary conditional block whose body is rules, and treating it
        // as an enhancement dropped the at-rule from every one of them --
        // symmetrically, for a long time, because Tailwind writes
        // `supports-[…]:flex` at the top level too. It stopped being
        // symmetric the moment Tailwind nested one and Hozo did not:
        // `before:supports-[display:grid]:flex` reads as a rule with no
        // condition on one side and a condition on the other, for two
        // outputs that mean the same thing.
        const folded = name.startsWith('@supports') && parent !== null
        if (!folded) open.push(name)
        // A conditional at-rule *inside* a style rule is that rule again
        // under a condition, not a different element -- so it becomes its
        // own rule with the same selector rather than having its
        // declarations dropped. Tailwind writes `before:md:flex` that way:
        // `::before { content: …; @media … { display: flex } }`, and the
        // `display` was invisible here until this existed.
        const conditional = !folded && parent ? nest(rules, parent.selector, open) : null
        // A nested `@supports` gets a rule of its own too, and then gives
        // back at close whichever declarations restate a property the
        // enclosing rule already set -- see `settleSupports`.
        const enhancement = folded && parent ? nest(rules, parent.selector, [...open, name]) : null
        stack.push({
          target: conditional ?? enhancement ?? (folded ? parent : null),
          opened: !folded,
          foldInto: enhancement ? parent : undefined,
        })
      } else if (parent) {
        // A nested style rule, resolved against the one containing it.
        // `&` is the parent's selector, which is how CSS nesting reads it
        // and how Tailwind writes a stacked variant after a
        // pseudo-element.
        stack.push({
          target: nest(rules, name.replaceAll('&', parent.selector), open),
          opened: false,
        })
      } else {
        const rule: Rule = { selector: name, declarations: '', atRules: [...open] }
        rules.push(rule)
        stack.push({ target: rule, opened: false })
      }
      continue
    }

    if (ch === '}') {
      // A last declaration without its semicolon still counts.
      flush()
      const frame = stack.pop()
      if (frame?.opened) open.pop()
      if (frame?.foldInto && frame.target) settleSupports(frame.target, frame.foldInto)
      continue
    }

    buffer += ch
    if (ch === ';') flush()
  }

  // `@property --x { ... }` bodies are descriptors rather than
  // declarations to compare, and the `to`/`50%` steps inside `@keyframes`
  // are not rules any candidate produced. Both are filtered by the
  // callers, which know which selectors they care about.
  //
  // A rule with nothing in it is dropped, though. Reading CSS nesting
  // produces them: `::before { content: …; &:hover { @media … { … } } }`
  // has a `&:hover` whose whole body is the query, and counting that as a
  // rule made the flattened output one longer than the same CSS written
  // without nesting. Nothing downstream compares an empty rule; it only
  // shifts the ones after it.
  return rules.filter((rule) => rule.declarations.trim() !== '')
}

/**
 * A rule for `selector` under `atRules`, appended and returned.
 *
 * Separate from the top-level path only because a nested rule's selector
 * and at-rules are computed rather than read.
 */
function nest(rules: Rule[], selector: string, atRules: string[]): Rule {
  const rule: Rule = { selector, declarations: '', atRules: [...atRules] }
  rules.push(rule)
  return rule
}

/**
 * Splits a nested `@supports` between an enhancement and a new rule.
 *
 * Two different things wear this shape and they need opposite treatment.
 *
 * Tailwind writes a progressive enhancement by setting a property twice --
 * `--tw-gradient-position: to right`, then the same property again as
 * `to right in oklab` inside `@supports`. The browsers this compiles for
 * have the feature, so the enhanced value is the real one, and folding it
 * into the enclosing rule is what makes the comparison see what will
 * actually apply.
 *
 * `before:supports-[display:grid]:flex` is the other thing. There the
 * enclosing rule sets `content` and the nested block adds `display` --
 * a declaration that exists *only* under the condition. Folding that one
 * in claimed the rule sets `display: flex` unconditionally, which is a
 * claim about a different rule, and it read as a mismatch against a Hozo
 * output that was correct.
 *
 * The line between them is whether the nested block restates a property
 * the enclosing rule already has. Same property: an enhancement, folded.
 * New property: its own rule, under its own at-rule.
 */
function settleSupports(nested: Rule, parent: Rule): void {
  const existing = new Set(propertiesIn(parent.declarations))
  const kept: string[] = []
  for (const declaration of nested.declarations.split(';')) {
    if (declaration.trim() === '') continue
    const property = declaration.slice(0, declaration.indexOf(':')).trim().toLowerCase()
    if (existing.has(property)) parent.declarations += `${declaration};`
    else kept.push(declaration)
  }
  nested.declarations = kept.length > 0 ? `${kept.join(';')};` : ''
}

/** The property names a declaration block sets. */
function propertiesIn(declarations: string): string[] {
  return declarations
    .split(';')
    .filter((declaration) => declaration.includes(':'))
    .map((declaration) => declaration.slice(0, declaration.indexOf(':')).trim().toLowerCase())
}

/** The index of the quote closing the one at `start`. */
function closingQuote(css: string, start: number): number {
  const quote = css[start]
  for (let i = start + 1; i < css.length; i += 1) {
    if (css[i] === '\\') {
      i += 1
      continue
    }
    if (css[i] === quote) return i
  }
  return css.length - 1
}
