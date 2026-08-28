// Every ARIA role, written correctly, asked whether the compiler complains.
//
// The seven accessibility diagnostics had no denominator at all. Not one of
// them appeared anywhere in this package, so neither half of what they
// claim was measured: that they fire on the defects they name, and -- the
// half that decides whether anyone leaves them switched on -- that they
// stay quiet on code that is right.
//
// A diagnostic that cries wolf is worse than one that does not exist. The
// first thing a team does with a noisy check is turn it off, and then the
// real findings go with it. So this section builds a correct element for
// every concrete role in the specification and counts how many produce a
// complaint. The number has to be zero.
//
// Derived from `aria-query`, which is the specification in machine-readable
// form -- the same package `scripts/generate-aria.mjs` reads to write
// `crates/hozo_parser/src/aria.rs`. Deliberately the package and not the
// generated file: measuring Hozo against its own copy of the rules would
// agree with itself by construction. `aria.test.ts` is what keeps the copy
// honest; this keeps the *behaviour* honest.

import { createRequire } from 'node:module'

import { compile, compileNative } from '@hozo/compiler'

const require = createRequire(import.meta.url)

interface AriaRoleDefinition {
  abstract: boolean
  accessibleNameRequired?: boolean
  prohibitedProps?: string[]
  requiredProps?: Record<string, unknown>
  requireContextRole?: string[]
  /**
   * Children the role is incomplete without, as alternatives: a `table`
   * lists `[["row"], ["row", "rowgroup"]]`, meaning either shape will do.
   */
  requiredOwnedElements?: string[][]
}

/**
 * A value that satisfies each state a role cannot do without.
 *
 * Six of them across the whole specification, which is why this is a table
 * rather than a generator: the *roles* come from the package, and these are
 * only what to put in the attribute so the element is complete. A wrong
 * value here would show up as a false positive, which is the number this
 * section is watching, so it cannot hide.
 */
const REQUIRED_PROP_VALUES: Record<string, string> = {
  'aria-checked': '"true"',
  'aria-controls': '"hozo-aria-target"',
  'aria-expanded': '"true"',
  'aria-level': '{1}',
  'aria-selected': '"true"',
  'aria-valuenow': '{1}',
}

export interface AriaRoleCase {
  role: string
  source: string
}

export type AriaRoleVerdict = 'CLEAN' | 'COMPLAINED'

export interface AriaRoleResult extends AriaRoleCase {
  verdict: AriaRoleVerdict
  /** Diagnostic codes raised, on either backend. */
  codes: string[]
}

function roleDefinitions(): Map<string, AriaRoleDefinition> {
  const { roles } = require('aria-query') as {
    roles: Map<string, AriaRoleDefinition>
  }
  // The two extension vocabularies are out, the same way the generator
  // leaves them out: `doc-*` is DPUB and `graphics-*` is SVG, and neither
  // is part of what a component library is expected to know.
  return new Map(
    [...roles.entries()].filter(
      ([name]) => !name.startsWith('doc-') && !name.startsWith('graphics-'),
    ),
  )
}

/** The attributes an element of this role needs to be complete. */
function attributesFor(name: string, definition: AriaRoleDefinition): string {
  const parts = [`role="${name}"`]
  for (const prop of Object.keys(definition.requiredProps ?? {})) {
    parts.push(`${prop}=${REQUIRED_PROP_VALUES[prop] ?? '"true"'}`)
  }
  // A name where the role needs one and does not refuse one. Eleven roles
  // prohibit it -- `generic`, which is what a bare `View` is, among them --
  // and giving one anyway is itself a diagnostic, correctly.
  const prohibited = definition.prohibitedProps ?? []
  if (definition.accessibleNameRequired && !prohibited.includes('aria-label')) {
    parts.push('aria-label="Name"')
  }
  return parts.join(' ')
}

/**
 * What a role must contain, or plain text where it need contain nothing.
 *
 * The first alternative, built complete in turn -- a `table` needs a `row`
 * and a `row` needs a `cell`, so a container built empty is an incomplete
 * pattern and the diagnostic saying so is right. Thirteen roles were
 * counted as false positives before this existed, which was the apparatus
 * being wrong rather than the compiler: `list`, `tablist`, `table`, `tree`
 * and the rest are exactly the roles that own something.
 */
function children(
  definition: AriaRoleDefinition,
  definitions: Map<string, AriaRoleDefinition>,
  depth: number,
): string {
  const owned = definition.requiredOwnedElements?.[0]
  if (!owned || owned.length === 0 || depth >= 6) return 'x'
  return owned.map((child) => bare(child, definitions, depth + 1)).join('')
}

/** A complete element of `name`, without re-adding the ancestors it is already inside. */
function bare(
  name: string,
  definitions: Map<string, AriaRoleDefinition>,
  depth: number,
): string {
  const definition = definitions.get(name)
  if (!definition) return `<View role="${name}">x</View>`
  return `<View ${attributesFor(name, definition)}>${children(definition, definitions, depth)}</View>`
}

/**
 * The element, inside whatever ancestors its role requires.
 *
 * Recursive because the requirement chains: a `row` must be in a `table`, a
 * `cell` must be in a `row`. Each ancestor is built complete in turn, since
 * an incomplete one would raise a diagnostic of its own and the count would
 * blame the wrong element.
 */
function nested(
  name: string,
  definitions: Map<string, AriaRoleDefinition>,
  depth = 0,
): string {
  const definition = definitions.get(name)
  if (!definition) return `<View role="${name}">x</View>`
  const element = `<View ${attributesFor(name, definition)}>${children(definition, definitions, depth)}</View>`
  const context = definition.requireContextRole?.[0]
  // Six is past the deepest chain in the specification, and stops a
  // cycle -- `row` inside `rowgroup` inside `table` terminates, but the
  // table is not the only shape the spec allows and a future one might not.
  if (!context || depth >= 6) return element
  return nestedAround(element, name, context, definitions, depth + 1)
}

/**
 * Wraps `inner` in `name`, and in whatever `name` in turn must sit inside.
 *
 * The wrapper gets the siblings it still needs. A `table` owns
 * `["row"]` or `["row", "rowgroup"]`, so wrapping a `rowgroup` in one
 * leaves the `row` missing -- and the table then raises an incomplete
 * pattern that has nothing to do with the role under test. That was the
 * last false positive in this section, and it was the apparatus again.
 */
function nestedAround(
  inner: string,
  innerRole: string,
  name: string,
  definitions: Map<string, AriaRoleDefinition>,
  depth: number,
): string {
  const definition = definitions.get(name)
  if (!definition || depth >= 6) return inner
  const alternatives = definition.requiredOwnedElements ?? []
  // The alternative the inner element is part of, so the siblings added
  // are the ones that alternative still wants.
  const chosen = alternatives.find((alternative) => alternative.includes(innerRole))
  const siblings = (chosen ?? [])
    .filter((role) => role !== innerRole)
    .map((role) => bare(role, definitions, depth + 1))
    .join('')
  // No alternative mentions it: the wrapper's own children are whatever it
  // needs, and the inner element sits beside them.
  const own = chosen === undefined ? children(definition, definitions, depth) : ''
  const body = own === 'x' ? inner : `${own}${siblings}${inner}`
  const wrapped = `<View ${attributesFor(name, definition)}>${body}</View>`
  const above = definition.requireContextRole?.[0]
  if (!above) return wrapped
  return nestedAround(wrapped, name, above, definitions, depth + 1)
}

/** One correctly-written element per concrete role in the specification. */
export function ariaRoleCases(): AriaRoleCase[] {
  const definitions = roleDefinitions()
  return [...definitions.entries()]
    // Abstract roles are ones the specification forbids authors to write,
    // so "written correctly" does not apply: the diagnostic for using one
    // is the right answer, and counting it as a false positive would be
    // exactly backwards.
    .filter(([, definition]) => !definition.abstract)
    .map(([role]) => ({ role, source: nested(role, definitions) }))
}

export function compareAriaRole(testCase: AriaRoleCase): AriaRoleResult {
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function C() { return (${testCase.source}) }\n`
  const codes = [
    ...(compile(source)[0]?.diagnostics ?? []),
    ...(compileNative(source)[0]?.diagnostics ?? []),
  ].map((diagnostic) => diagnostic.code)
  const distinct = [...new Set(codes)]
  return {
    ...testCase,
    verdict: distinct.length === 0 ? 'CLEAN' : 'COMPLAINED',
    codes: distinct,
  }
}
