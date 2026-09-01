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
   * The ontology chains this role descends through, outermost last.
   *
   * `button` is `[["roletype", "widget", "command"]]`. A chain containing
   * `widget` is what the specification means by interactive, which is how
   * the second family below decides who gets a press handler: putting one
   * on a `paragraph` deserves a complaint, and counting that complaint as
   * a false positive would be exactly backwards.
   */
  superClass?: string[][]
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
  /** Which family it belongs to, for the report. */
  family: 'static' | 'interactive'
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
function bare(name: string, definitions: Map<string, AriaRoleDefinition>, depth: number): string {
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
function nested(name: string, definitions: Map<string, AriaRoleDefinition>, depth = 0): string {
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
  // Abstract roles are ones the specification forbids authors to write, so
  // "written correctly" does not apply: the diagnostic for using one is the
  // right answer, and counting it as a false positive would be exactly
  // backwards.
  const concrete = [...definitions.entries()].filter(([, definition]) => !definition.abstract)

  const staticCases: AriaRoleCase[] = concrete.map(([role]) => ({
    role,
    source: nested(role, definitions),
    family: 'static' as const,
  }))

  // The same roles again, made interactive -- and only the ones the
  // specification calls interactive.
  //
  // Four diagnostics could not be reached by the family above, because a
  // correctly-written role carries no tabIndex, no id, no nesting and no
  // handler: `A11Y_POSITIVE_TAB_INDEX`, `A11Y_DUPLICATE_ID`,
  // `A11Y_INTERACTIVE_NESTING` and `A11Y_PRESS_WITHOUT_KEYBOARD`. Every one
  // of them is proved to *fire* by `diagnostics.ts`; nothing proved they
  // stay quiet, which is the half that decides whether a check survives
  // contact with a real codebase.
  //
  // A `Pressable` rather than a `View`, because `onPress` is not a View
  // prop on either platform -- React Native puts it on Pressable and the
  // DOM has no such event. Found by writing it the other way first.
  const interactiveCases: AriaRoleCase[] = concrete
    .filter(([, definition]) => isWidget(definition))
    .map(([role], index) => ({
      role,
      source: interactive(role, definitions, index),
      family: 'interactive' as const,
    }))

  return [...staticCases, ...interactiveCases]
}

function isWidget(definition: AriaRoleDefinition): boolean {
  return (definition.superClass ?? []).some((chain) => chain.includes('widget'))
}

/**
 * The role again, on something that can actually be pressed.
 *
 * `tabIndex={0}` joins the natural tab order, which is the value the
 * diagnostic asks for; a positive one is what it refuses. The id is unique
 * per case so the duplicate check has something correct to be quiet about,
 * and nothing here nests one interactive element inside another -- the
 * required-context wrappers are plain `View`s.
 */
function interactive(
  name: string,
  definitions: Map<string, AriaRoleDefinition>,
  index: number,
): string {
  const definition = definitions.get(name)
  if (!definition) return `<Pressable role="${name}">x</Pressable>`
  const attributes = [
    attributesFor(name, definition),
    `tabIndex={0}`,
    `nativeID="hozo-role-${index}"`,
    `onPress={go}`,
  ]
  // A name, even where the role does not demand one: an interactive
  // element without one is `A11Y_INTERACTIVE_WITHOUT_ROLE` territory, and
  // that complaint would be correct rather than a false positive.
  const prohibited = definition.prohibitedProps ?? []
  if (!prohibited.includes('aria-label') && !definition.accessibleNameRequired) {
    attributes.push('aria-label="Name"')
  }
  const inside = children(definition, definitions, 0)
  const element = `<Pressable ${attributes.join(' ')}>${inside}</Pressable>`
  const context = definition.requireContextRole?.[0]
  if (!context) return element
  return nestedAround(element, name, context, definitions, 1)
}

export function compareAriaRole(testCase: AriaRoleCase): AriaRoleResult {
  const source =
    `import { View } from '@hozo/core'\n` + `export function C() { return (${testCase.source}) }\n`
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
