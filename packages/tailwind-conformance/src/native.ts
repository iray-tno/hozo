// Native-side coverage. Deliberately *not* a fidelity check: Tailwind is
// CSS, so it can only be ground truth for the Web lowering. Nothing
// authoritative defines what `p-4` should be in React Native, so there's
// nothing to diff against -- only what Hozo does with each utility.
//
// The distinction that matters here is between a gap Hozo *knows about*
// and one it doesn't. Refusing `grid` by name is a supportable answer;
// quietly emitting nothing is the failure mode this project keeps trying
// to avoid, so the two are counted separately rather than lumped together
// as "unsupported".

import { compileNative } from '@hozo/compiler'

export type NativeVerdict = 'COVERED' | 'REFUSED' | 'SILENT' | 'NO_OP'

/**
 * Utilities whose effect React Native already has by default, so lowering
 * them to nothing honours them rather than dropping them.
 *
 * Separated from SILENT because the two look identical from outside -- no
 * style, no diagnostic -- and mean opposite things. Leaving them in the
 * silent count would make that number read "unexplained" when it should
 * read "unaccounted for", which is the number that has to stay at zero for
 * the refuse-loudly discipline to mean anything.
 *
 * Each entry needs its reason, for the same reason `ACCEPTED_DIFFERENCES`
 * does: an unexplained allowlist is where a real drop goes to hide.
 */
const DELIBERATE_NO_OPS: Record<string, string> = {
  'whitespace-normal': "React Native's Text wraps by default, so this asks for what it already does",
  'line-clamp-none':
    'not clamping is the absence of `numberOfLines`, not a value for it -- there is no prop to emit',
}

export interface NativeComparison {
  candidate: string
  verdict: NativeVerdict
  detail?: string
  /**
   * The diagnostic code behind a REFUSED verdict. The two codes make very
   * different claims -- WEB_ONLY says the platform cannot do this at all,
   * NOT_WIRED says Hozo hasn't built it yet -- and only the first
   * is a claim about React Native that can be checked against React Native.
   */
  code?: string
  /**
   * Set when a utility lowers in some probe contexts but is refused in
   * others. Counting it as covered answers "is this usable on Native",
   * but writing it in the wrong place still fails the build -- so the
   * restriction has to be reported, not folded into the number.
   */
  restrictedTo?: string[]
}

/// Diagnostic codes that mean "Hozo knows it can't render this, and says
/// so". Both count as REFUSED, since the distinction this report draws is
/// named-gap vs. silent-gap, not error vs. warning:
/// - WEB_ONLY: impossible on the platform (Yoga has no grid).
/// - NOT_WIRED: possible, not built yet (`dark:`, `placeholder-*`).
const NAMED_GAPS = new Set(['WEB_ONLY_PROPERTY_ON_NATIVE', 'NOT_WIRED_ON_NATIVE'])

/// Whether a utility works can depend on where it's written, so each
/// candidate is tried in several places and counts as covered if *any* of
/// them works -- the question is "can this be used on Native at all", not
/// "does it work on a bare View".
///
/// - `View` / `Text`: truncation lowers to `numberOfLines`, which only
///   exists on `Text`.
/// - `first child`: `first:` is resolved from the element's position in
///   the JSX tree, which only exists for a child. Probing it only at the
///   root would measure the one context where `:first-child` is
///   meaningless anyway.
///
/// Every context wraps the JSX in a function component, because some
/// utilities only work there: `dark:` and the breakpoints compile to a
/// React hook, and a hook needs a statement position inside a component.
/// Probing at module scope would score them covered while a real build of
/// that same source refuses them.
const PROBE_CONTEXTS = [
  {
    name: 'View',
    render: (candidate: string) =>
      `import { View } from '@hozo/core'\n` +
      `export function C() {\n  return <View className="${candidate}">x</View>\n}\n`,
  },
  {
    name: 'Text',
    render: (candidate: string) =>
      `import { Text } from '@hozo/core'\n` +
      `export function C() {\n  return <Text className="${candidate}">x</Text>\n}\n`,
  },
  {
    // Named line-height and letter-spacing scales are relative to the
    // current font size. RN stores absolute numbers, so this context proves
    // Hozo can resolve them when that size is inherited from an ancestor.
    name: 'Text inheriting text-lg',
    render: (candidate: string) =>
      `import { View, Text } from '@hozo/core'\n` +
      `export function C() {\n` +
      `  return <View className="text-lg"><Text className="${candidate}">x</Text></View>\n}\n`,
  },
  {
    // `disabled:` has a real driver only when the element also has a
    // disabled prop. Probing it exclusively on View/Text made a supported
    // conditional style look globally refused, unlike the target-aware
    // TextInput and first-child probes below.
    name: 'disabled Button',
    render: (candidate: string) =>
      `import { Button } from '@hozo/core'\n` +
      `export function C() {\n  return <Button disabled={true} className="${candidate}">x</Button>\n}\n`,
  },
  {
    // Hover and focus are event-driven on Native. Hozo intentionally
    // wires them only where those events have interactive semantics,
    // rather than adding state and handlers to every View in the app.
    name: 'Pressable',
    render: (candidate: string) =>
      `import { Pressable } from '@hozo/core'\n` +
      `export function C() {\n` +
      `  return <Pressable accessibilityRole="button" className="${candidate}">x</Pressable>\n}\n`,
  },
  {
    // `placeholder-*` only means anything where a placeholder exists, and
    // React Native carries that colour as a prop on this component rather
    // than as a style on anything -- so a probe set without a TextInput
    // can only ever report those 291 as unusable.
    //
    // Labelled, because the compiler warns about a field with no
    // accessible name and the probe should be testing the utility rather
    // than tripping that.
    name: 'TextInput',
    render: (candidate: string) =>
      `import { TextInput } from '@hozo/core'\n` +
      `export function C() {\n` +
      `  return <TextInput className="${candidate}" accessibilityLabel="Field" />\n}\n`,
  },
  {
    // `*:` and `**:` hand their style to the element's *children*, and
    // every other context here has only a text child -- which becomes an
    // inserted `Text` and is not what a subtree selector reaches. So they
    // produced nothing, correctly, and the probe had no way to tell that
    // from producing nothing incorrectly.
    //
    // 744 of the 939 silences the repaired check first reported were
    // this: a measurement with no place to put the answer, not a compiler
    // that dropped it.
    // Three children, one of them holding a child of its own and one of
    // them empty, because the subtree variants stack with the structural
    // ones: `*:even:` needs a second child to be even, `*:nth-3:` needs a
    // third, `*:empty:` needs one with nothing in it, and `*:**:` needs a
    // grandchild. A single child answered none of those, and each came
    // back as silence -- correct output with nowhere to appear.
    // One child, because `*:only:` wants the opposite of what the context
    // below wants: with three children none of them is an only child, and
    // with one there is no second to be even or third to be third. Two
    // contexts rather than a cleverer single one -- a candidate covered in
    // either is covered, which is what the aggregate already means.
    name: 'parent of one element',
    render: (candidate: string) =>
      `import { View } from '@hozo/core'\n` +
      `export function C() {\n  return (\n    <View className="${candidate}">\n` +
      `      <View>x</View>\n    </View>\n  )\n}\n`,
  },
  {
    name: 'parent of elements',
    render: (candidate: string) =>
      `import { View } from '@hozo/core'\n` +
      `export function C() {\n  return (\n    <View className="${candidate}">\n` +
      `      <View>x</View>\n` +
      `      <View><View>y</View></View>\n` +
      `      <View />\n    </View>\n  )\n}\n`,
  },
  {
    name: 'first child',
    render: (candidate: string) =>
      `import { View } from '@hozo/core'\n` +
      `export function C() {\n  return (\n    <View>\n` +
      `      <View className="${candidate}">x</View>\n    </View>\n  )\n}\n`,
  },
] as const

function probe(candidate: string, context: (typeof PROBE_CONTEXTS)[number]): NativeComparison {
  const source = context.render(candidate)
  const results = compileNative(source)
  if (results.length === 0) {
    return { candidate, verdict: 'SILENT', detail: 'no component compiled' }
  }

  const [result] = results
  // The same context with nothing in the class attribute, so every check
  // below can ask whether the *candidate* produced something rather than
  // whether the file did.
  //
  // Without this the third context reported COVERED for every candidate
  // ever passed to it, including ones that are not classes at all. It
  // wraps the element in a `text-lg` ancestor to prove inheritance
  // resolves, and `results[0]` is that ancestor -- whose style is real
  // whatever the inner element carries. One context answering COVERED is
  // enough for the aggregate, so `silent` could not have been anything
  // but zero, and it was reported as "the one that has to stay at zero"
  // for as long as it has existed.
  const baseline = compileNative(context.render(''))[0]
  const refusals = result.diagnostics.filter((d) => NAMED_GAPS.has(d.code))

  // A refusal is checked first, and beats any partial output: it's a
  // build-stopping error, so the utility can't be used on Native at all
  // even if some of what it expands to did lower. `truncate` on a View is
  // exactly that -- its `overflow` lowers fine while the truncation itself
  // has nowhere to go, and calling it "covered" would claim a build that
  // in fact fails.
  if (refusals.length > 0) {
    return {
      candidate,
      verdict: 'REFUSED',
      code: refusals[0].code,
      detail: `[${refusals[0].severity}] ${refusals[0].message}`,
    }
  }
  // A prop counts as coverage too: RN expresses some CSS concepts that
  // way (`numberOfLines`), and the utility is honoured either way.
  // Against the baseline too: the context's own props -- a `Text` wrapper
  // the compiler inserts, an `accessibilityRole` a primitive carries --
  // are not this candidate's doing.
  const strip = (jsx: string) => jsx.replace(/\sstyle=\{[^}]*\}+/g, '')
  const emitsProp = strip(result.jsx) !== strip(baseline?.jsx ?? '')

  // A style entry counts only if it has declarations in it *and* the
  // rendered JSX references it. Both halves are load-bearing, and each was
  // wrong on its own:
  // - checking the StyleSheet alone (until 2026-08-15) scored every
  //   variant-prefixed utility as covered -- `hover:bg-blue-500` does
  //   produce a `hozo0_hover` entry, it just never reaches the element.
  // - checking the reference alone lets `whitespace-normal` through, which
  //   emits an empty `hozo0: {}` and a `style` prop pointing at it.
  // Against the baseline, not in absolute terms: what matters is what the
  // candidate added. A style entry the context would have produced anyway
  // is not evidence that this class lowered.
  const declarations = (styles: string) =>
    new Set(
      [...styles.matchAll(/^ {2}(\w+):\s*\{\n([\s\S]*?)^ {2}\},/gm)].flatMap(([, name, body]) =>
        (body ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
          .map((line) => `${name}|${line}`),
      ),
    )
  const before = declarations(baseline?.styles ?? '')
  const entries = [...result.styles.matchAll(/^ {2}(\w+):\s*\{\n([\s\S]*?)^ {2}\},/gm)]
  const nonEmpty = entries
    .filter(([, name, body]) =>
      (body ?? '')
        .split('\n')
        .map((line) => line.trim())
        .some((line) => line !== '' && !before.has(`${name}|${line}`)),
    )
    .map((m) => m[1])
  // `hozoStyles.`, not `styles.`: the emitter writes
  // `style={hozoStyles.hozo0}` and the capital S meant this substring
  // never matched, so `rendered` was empty for everything. It went
  // unnoticed because the `text-lg` context above was answering COVERED
  // for every candidate regardless -- two faults, each hiding the other.
  const unreferenced = nonEmpty.filter((name) => !result.jsx.includes(`hozoStyles.${name}`))
  const rendered = nonEmpty.filter((name) => result.jsx.includes(`hozoStyles.${name}`))

  // An inline style object counts too. Not everything can live in the
  // StyleSheet: a viewport-relative size changes when the device rotates,
  // and `StyleSheet.create` is evaluated once -- so `h-screen` compiles to
  // `style={{ height: __hozoViewport.height }}` with no entry to find.
  // Matches an object literal with at least one key inside a `style` prop,
  // so a bare `style={styles.hozo0}` doesn't qualify on its own.
  const inlineStyle = /style=\{\[?[^}]*\{\s*\w+:/.test(result.jsx)

  // A style that comes from a runtime hook counts too, and is neither of
  // the two above: `animate-spin` compiles to `style={__hozoAnim_spin}`,
  // which is not a StyleSheet entry and not an object literal, so it fell
  // through every check and read as silence. The binding is the evidence.
  const hookStyle =
    /style=\{\[?[^}]*__hozo/.test(result.jsx) && !/style=\{\[?[^}]*__hozo/.test(baseline?.jsx ?? '')

  if (rendered.length > 0 || inlineStyle || emitsProp || hookStyle) {
    return { candidate, verdict: 'COVERED' }
  }
  const noOp = DELIBERATE_NO_OPS[candidate]
  if (noOp && unreferenced.length === 0) {
    return { candidate, verdict: 'NO_OP', detail: noOp }
  }
  return {
    candidate,
    verdict: 'SILENT',
    detail: unreferenced.length
      ? `compiles to a style (${unreferenced.join(', ')}) that the JSX never references, and raises no diagnostic`
      : 'compiles to no style and raises no diagnostic',
  }
}

export function compareNativeCandidate(candidate: string): NativeComparison {
  const attempts = PROBE_CONTEXTS.map((context) => ({
    context: context.name,
    result: probe(candidate, context),
  }))

  const working = attempts.filter((a) => a.result.verdict === 'COVERED')
  if (working.length > 0) {
    const covered = working[0].result
    if (working.length === PROBE_CONTEXTS.length) {
      return covered
    }
    // Works somewhere but not everywhere. Still covered, but the report
    // must say where -- otherwise the number quietly implies it works
    // anywhere, and using it in the wrong place is a build failure.
    return { ...covered, restrictedTo: working.map((a) => a.context) }
  }
  // Otherwise report the more informative verdict: a refusal names the
  // reason, silence doesn't.
  return attempts.find((a) => a.result.verdict === 'REFUSED')?.result ?? attempts[0].result
}
