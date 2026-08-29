// Every diagnostic the compiler declares, and a source that provokes it.
//
// The other half of the accessibility measurement. `aria-roles.ts` asks
// whether the checks stay quiet on correct code; this asks whether they
// speak at all. Neither was measured before, and the second is the one that
// can rot invisibly: a check that stopped firing looks exactly like a
// codebase with no defects in it. Every diagnostic in this compiler could
// be replaced with `return` today and nothing in the report would move.
//
// The denominator is read from `diagnostic_code_str` in `crates/hozo_napi`,
// which is an exhaustive `match` over the whole enum -- adding a variant
// without a string does not compile, so that function cannot be missing
// one. The cases are written by hand, which is the honest division: the
// *list* has to be derived or it goes stale, and what provokes a
// `DYNAMIC_PROP_NOT_RESOLVED` is a judgement nothing can derive.
//
// A code with no case is reported uncovered rather than skipped. That is
// the guard: a new diagnostic arrives in this section the day it is
// written, as a number that moved.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compile, compileNative } from '@hozo/compiler'

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

/**
 * Every code the addon can emit, from the one place that must list them all.
 *
 * Read from the source rather than from a copy here, for the reason every
 * denominator in this package is: a list of somebody else's cases kept by
 * hand is a list that drifts, and the drift is invisible because both
 * halves look reasonable.
 */
export function declaredDiagnosticCodes(): string[] {
  const source = readFileSync(
    path.join(repoRoot(), 'crates', 'hozo_napi', 'src', 'lib.rs'),
    'utf8',
  )
  const codes = [...source.matchAll(/DiagnosticCode::\w+\s*=>\s*"([A-Z0-9_]+)"/g)].map(
    (match) => match[1],
  )
  if (codes.length === 0) {
    throw new Error(
      'no diagnostic codes found in hozo_napi -- the match this reads has moved, and a ' +
        'denominator that silently became empty is the failure this file exists to prevent',
    )
  }
  return [...new Set(codes)].sort()
}

interface Provocation {
  /** JSX to put inside the shared module. */
  source?: string
  /** A whole module, for the cases that need imports of their own. */
  module?: string
  /** Only one backend raises some of these. */
  backend?: 'web' | 'native' | 'both'
}

/**
 * A source that should make each diagnostic fire.
 *
 * Written, not derived -- see the header. Each is the smallest thing that
 * provokes the check, so a case failing means the check stopped working
 * rather than that the fixture drifted into something elaborate.
 */
const PROVOCATIONS: Record<string, Provocation> = {
  A11Y_INTERACTIVE_WITHOUT_ROLE: { source: '<Pressable onPress={go}>x</Pressable>' },
  ROLE_HAS_NO_WEB_EQUIVALENT: { source: '<View role="drawerlayout">x</View>', backend: 'web' },
  ARIA_INCOMPLETE_PATTERN: { source: '<View role="checkbox">x</View>' },
  // Written out by name, which is what `check_allowed` reads: an opaque
  // `accessibilityState` could carry anything, and this module's rule is
  // that an unreadable expression means "cannot tell" rather than "no".
  ARIA_PROP_NOT_ALLOWED: {
    source: '<View role="button" aria-label="Go" accessibilityState={{ selected: true }}>x</View>',
  },
  ARIA_NAME_PROHIBITED: { source: '<View role="generic" aria-label="No">x</View>' },
  FOCUSABLE_DISABLED_UNSUPPORTED: {
    source: '<Pressable role="button" aria-label="Go" disabled focusable onPress={go}>x</Pressable>',
  },
  A11Y_DIALOG_WITHOUT_DISMISS: { source: '<Dialog open aria-label="Confirm">x</Dialog>' },
  // An Image, not a Pressable: this one names the alternative text an
  // image has no substitute for. A Pressable with no name is
  // `A11Y_INTERACTIVE_WITHOUT_ROLE` territory instead.
  A11Y_MISSING_ACCESSIBLE_NAME: { source: '<Image src="a.png" />', backend: 'native' },
  INVALID_SEMANTIC_NESTING: { source: '<Paragraph><Section>x</Section></Paragraph>' },
  A11Y_HIDDEN_BUT_FOCUSABLE: {
    source: '<Pressable role="button" aria-label="Go" aria-hidden tabIndex={0} onPress={go}>x</Pressable>',
  },
  A11Y_HEADING_LEVEL_SKIPPED: {
    source: '<View><Heading level={1}>a</Heading><Heading level={3}>b</Heading></View>',
  },
  HOZO_ATTRIBUTE_IS_PRIVATE: { source: '<View className="data-[hozo-disabled]:p-4">x</View>' },
  // `nativeID`, which is the prop the compiler reads. `id` is a
  // different attribute and passes straight through.
  A11Y_DUPLICATE_ID: {
    source: '<View><View nativeID="x">a</View><View nativeID="x">b</View></View>',
  },
  A11Y_INTERACTIVE_NESTING: {
    source:
      '<Pressable role="button" aria-label="Outer" onPress={go}>' +
      '<Pressable role="button" aria-label="Inner" onPress={go}>x</Pressable></Pressable>',
  },
  A11Y_PRESS_WITHOUT_KEYBOARD: { source: '<View role="button" aria-label="Go" onPress={go}>x</View>' },
  A11Y_POSITIVE_TAB_INDEX: {
    source: '<Pressable role="button" aria-label="Go" tabIndex={3} onPress={go}>x</Pressable>',
  },
  UNREADABLE_ARBITRARY_VALUE: { source: '<View className="ring-offset-[2rem]">x</View>' },
  UNSAFE_PROP_SPREAD_AFTER_STYLE: { source: '<View className="p-4" {...rest}>x</View>' },
  WEB_ONLY_PROPERTY_ON_NATIVE: { source: '<View className="inline-block">x</View>', backend: 'native' },
  DYNAMIC_CLASS_NAME_NOT_RESOLVED: { source: '<View className={cls}>x</View>', backend: 'native' },
  // `multiline` decides which element a TextInput becomes on Web, so an
  // expression there is a question the compiler cannot answer.
  DYNAMIC_PROP_NOT_RESOLVED: {
    source: '<TextInput aria-label="Note" multiline={many} />',
    backend: 'web',
  },
  // A variant Tailwind has and Hozo has not built. Distinct from
  // `TAILWIND_VARIANT_CANNOT_MATCH`, which is a variant that *is* built and
  // can never apply to this element -- the difference is which side is at
  // fault.
  TAILWIND_VARIANT_NOT_SUPPORTED: { source: '<View className="open:p-4">x</View>' },
  // Built, correct, and unable to ever apply: a `div` cannot be required.
  TAILWIND_VARIANT_CANNOT_MATCH: { source: '<View className="required:p-4">x</View>' },
  VISITED_STYLE_IGNORED: { source: '<Link href="/a" className="visited:p-4">x</Link>' },
  NOT_WIRED_ON_WEB: { source: '<View className="bold-text:p-4">x</View>', backend: 'web' },
  // `contrast-less:` rather than `contrast-more:`, which used to be here
  // and stopped provoking anything the day React Native's own
  // `AccessibilityInfo.d.ts` was read and the variant was wired. This
  // section caught that: `fires` fell to 26 and `silent` rose to 1 in the
  // same run that added 225 covered native variants.
  //
  // `contrast-less:` is the durable choice, not merely the next one that
  // works: neither iOS nor Android exposes a reduce-contrast setting, so
  // it is unwired for a reason that cannot be researched away.
  NOT_WIRED_ON_NATIVE: { source: '<View className="contrast-less:p-4">x</View>', backend: 'native' },
  // A whole module, because StyleX arrives as a `stylex.create` call rather
  // than as an attribute. `translateX(calc(...))` is a value the Native
  // solver does not take.
  STYLEX_NOT_LOWERED: {
    module:
      `import * as stylex from '@stylexjs/stylex'\n` +
      `import { View } from '@hozo/core'\n` +
      `const styles = stylex.create({ root: { transform: 'translateX(calc(100% - 2px))' } })\n` +
      `export function C() { return <View {...stylex.props(styles.root)} /> }\n`,
  },
}

/**
 * Codes no source can provoke, with the reason.
 *
 * Counted apart from the ones that simply have no case yet: this is a
 * claim about the compiler rather than about the fixtures, and folding the
 * two together would let a real gap hide behind a documented one.
 */
const UNREACHABLE: Record<string, string> = {
  PRIMITIVE_NOT_LOWERED:
    'a defensive branch its own comment calls unreachable -- the finder only matches the ' +
    'four names `build_node` accepts, and it exists so that widening one and not the other ' +
    'degrades to a named gap instead of a silently uncompiled element',
}

export type DiagnosticVerdict = 'FIRES' | 'SILENT' | 'NO_CASE' | 'UNREACHABLE'

export interface DiagnosticResult {
  code: string
  verdict: DiagnosticVerdict
  /** What the case did raise, when it did not raise the code it was for. */
  raised: string[]
  /** Why, for the ones nothing can provoke. */
  reason?: string
}

const IMPORTS =
  `import { View, Text, Pressable, Button, Link, Dialog, Paragraph, Section, Heading, Image, TextInput } ` +
  `from '@hozo/core'\n`

export function compareDiagnostic(code: string): DiagnosticResult {
  const reason = UNREACHABLE[code]
  if (reason) return { code, verdict: 'UNREACHABLE', raised: [], reason }
  const provocation = PROVOCATIONS[code]
  if (!provocation) return { code, verdict: 'NO_CASE', raised: [] }

  const source =
    provocation.module ??
    `${IMPORTS}export function C() { return (${provocation.source}) }\n`
  const backend = provocation.backend ?? 'both'
  const raised = new Set<string>()
  const collect = (results: { diagnostics: { code: string }[] }[]) => {
    for (const diagnostic of results[0]?.diagnostics ?? []) raised.add(diagnostic.code)
  }
  if (backend !== 'native') {
    try {
      collect(compile(source))
    } catch {
      // A build-stopping error is one way for a diagnostic to arrive, and
      // the integrations throw on it. Nothing to collect, and the other
      // backend may still answer.
    }
  }
  if (backend !== 'web') {
    try {
      collect(compileNative(source))
    } catch {
      // As above.
    }
  }
  return {
    code,
    verdict: raised.has(code) ? 'FIRES' : 'SILENT',
    raised: [...raised],
  }
}
