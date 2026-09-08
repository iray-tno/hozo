// What a platform actually exposes, in the terms the compiler emitted.
//
// The static half of this exists: `a11y-contextual.ts` matches substrings
// of generated JSX, so it can say the compiler wrote
// `accessibilityRole="list"`. It cannot say whether React Native did
// anything with it. Those are different claims, and the second is the one a
// screen reader answers to.
//
// A device dump answers it, and the difficulty is that the two platforms do
// not speak the same language. Android reports `AccessibilityNodeInfo`
// fields -- a `class` name, a `content-desc`, `checked`, `enabled`. iOS
// reports XCUIElement types and traits. Neither is Hozo's vocabulary, and
// picking one would make the other a translation of a translation.
//
// So there is one vocabulary here and an adapter per platform into it,
// which is the shape this repository already settled on for text alignment
// (#178), path containment (#184) and text metrics (#218): each platform's
// measurement is its own, the rule is shared.
//
// The expectation is **not written down**. It is read off the compiler's
// own output for the same source, so this is a differential test rather
// than an assertion about what someone thought should happen -- the same
// discipline as the Tailwind conformance suite, one layer further out. A
// third hand-maintained table of "what each element should announce" is
// precisely the thing this repository keeps finding has drifted.
//
// Everything in this file is pure. A dump is a string, so a checked-in one
// is a fixture and the whole comparison runs offline in milliseconds; the
// device job's contribution is a fresh dump and the same comparison against
// it. Same split as `native-render.ts`, between producing a tree and
// asserting about one.

import { compileNative } from '@hozo/compiler'

/**
 * What an element announces, in the terms the compiler thinks in.
 *
 * `role` and `name` only. Not because state does not matter -- `disabled`
 * and `expanded` are half of what a screen reader says about a control --
 * but because the acceptance screen has no element that carries one yet,
 * and a field nothing populates is a field nobody checks.
 */
export interface AnnouncedNode {
  /** The `testID` the source gave it, which is the only stable join key. */
  testID: string
  /** Hozo's spelling: `list`, `button`, `image`, `header`, … */
  role?: string
  /** The accessible name. Not the visible text, and not the placeholder. */
  name?: string
}

/**
 * Android's class names for the roles React Native knows.
 *
 * The adapter, and the interesting half of this file. React Native does not
 * pass `accessibilityRole` through as data: it picks an Android *class* for
 * the view, and the class is where TalkBack reads the role from. So the
 * question "did the role survive" is really "did React Native choose the
 * widget that means it", and this table is the answer to that.
 *
 * Read off a real dump rather than from documentation -- `smoke-list` came
 * back as `AbsListView` and `smoke-interaction` as `Button`, which is what
 * put these two rows here. It grows one measured row at a time on purpose:
 * a guess about `android.widget.CheckBox` that nothing has rendered would
 * look exactly like a fact.
 */
export const ANDROID_ROLE_CLASSES: Record<string, readonly string[]> = {
  list: ['android.widget.AbsListView', 'android.widget.ListView'],
  button: ['android.widget.Button'],
}

/** Attributes off one `<node …/>` of a uiautomator dump. */
function attributes(tag: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
    found[match[1] as string] = match[2] as string
  }
  return found
}

/**
 * Every element a uiautomator dump exposes that the source named.
 *
 * React Native puts a `testID` in Android's `resource-id`, which is what
 * makes a dump joinable to a source at all -- nothing else in the tree
 * survives compilation recognisably.
 *
 * The role is inferred backwards through `ANDROID_ROLE_CLASSES`: a node
 * whose class is in one of the lists announces that role. A class in none
 * of them yields no role, which is the honest answer -- `ViewGroup` and
 * `TextView` are what React Native uses for everything it has no widget
 * for, and reporting `undefined` there is different from reporting that
 * the role was lost.
 */
export function parseAndroidDump(xml: string): Map<string, AnnouncedNode> {
  const byId = new Map<string, AnnouncedNode>()
  for (const match of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const attrs = attributes(match[1] as string)
    const testID = attrs['resource-id']
    // Android's own furniture -- `android:id/content`, the action bar --
    // is in every dump and belongs to no source.
    if (!testID || testID.includes(':id/')) continue

    const className = attrs.class ?? ''
    const role = Object.entries(ANDROID_ROLE_CLASSES).find(([, classes]) =>
      classes.includes(className),
    )?.[0]
    const description = attrs['content-desc']
    byId.set(testID, {
      testID,
      ...(role === undefined ? {} : { role }),
      ...(description ? { name: description } : {}),
    })
  }
  return byId
}

/**
 * The attribute text of every JSX element in a generated module.
 *
 * A scanner rather than a regular expression, and the reason is `=>`. The
 * generated output is full of arrow functions in props --
 * `style={({ pressed }) => [...]}` -- and a pattern that stops at the first
 * `>` stops in the middle of one. It did: `smoke-interaction` is the only
 * element on the acceptance screen with a callback before its `testID`, and
 * it was the only element silently missing from this side of the
 * comparison. Every assertion still passed, because a differential test
 * with one side missing an entry compares nothing and says so cheerfully.
 *
 * So: track brace depth and quotes, and end the element at a `>` outside
 * both.
 */
function* elementAttributes(jsx: string): Generator<string> {
  for (let index = 0; index < jsx.length; index += 1) {
    if (jsx[index] !== '<' || !/[A-Za-z]/.test(jsx[index + 1] ?? '')) continue
    let depth = 0
    let quote: string | undefined
    let cursor = index + 1
    while (cursor < jsx.length) {
      const character = jsx[cursor] as string
      if (quote !== undefined) {
        if (character === quote) quote = undefined
      } else if (character === '"' || character === "'" || character === '`') {
        quote = character
      } else if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
      } else if (character === '>' && depth === 0) {
        break
      }
      cursor += 1
    }
    yield jsx.slice(index + 1, cursor)
    // Deliberately not skipping to `cursor`. An element's attributes
    // contain other elements -- `renderItem={({ item }) => <View …/>}` is
    // most of this screen -- so jumping past the outer element's `>` skips
    // every element nested in its props. Doing that found exactly one
    // element in the whole module and every assertion still passed, which
    // is the second time in this file that an empty side of a differential
    // compared nothing and reported success.
  }
}

/** A JSX attribute's value, whether it was written as a string or a brace. */
function attributeValue(attrs: string, name: string): string | undefined {
  const quoted = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)
  if (quoted) return quoted[1]
  const braced = new RegExp(`\\b${name}=\\{"((?:[^"\\\\]|\\\\.)*)"\\}`).exec(attrs)
  return braced?.[1]
}

/**
 * What the Native backend emitted, for every element the source named.
 *
 * The other side of the comparison, and the reason there is no table to
 * maintain. Read from the compiled JSX rather than from the source: what
 * the author wrote and what the compiler decided are different things, and
 * the second is what the device was given.
 *
 * A `testID` built from an expression -- ``testID={`smoke-row-${id}`}`` --
 * is skipped. Its value is not knowable here, so it cannot be joined to a
 * dump, and guessing at the shape would be inventing a fact about the
 * running app.
 */
export function announcedByCompiler(source: string, file = 'App.tsx'): Map<string, AnnouncedNode> {
  const byId = new Map<string, AnnouncedNode>()
  for (const component of compileNative(source, file)) {
    for (const attrs of elementAttributes(component.jsx)) {
      const testID = attributeValue(attrs, 'testID')
      if (testID === undefined) continue
      // Both spellings, because the backend chooses between them. React
      // Native has `accessibilityRole` and the newer `role`, and
      // `hozo_native/src/markup.rs` picks per element -- a `Pressable`
      // with responder handlers gets `accessibilityRole` and one without
      // gets `role`. Reading only the first spelling silently found no
      // role on half the screen, which is how this line came to exist:
      // `smoke-list` is emitted with `accessibilityRole="list"` and
      // `smoke-interaction` with `role="button"`, so one fixture
      // exercises both.
      const role = attributeValue(attrs, 'accessibilityRole') ?? attributeValue(attrs, 'role')
      const name = attributeValue(attrs, 'accessibilityLabel')
      byId.set(testID, {
        testID,
        ...(role === undefined ? {} : { role }),
        ...(name === undefined ? {} : { name }),
      })
    }
  }
  return byId
}

/** One element where the compiler and the device disagree. */
export interface Divergence {
  testID: string
  field: 'role' | 'name'
  compiled: string | undefined
  device: string | undefined
}

/**
 * Where what the compiler emitted and what the platform exposes differ.
 *
 * Only elements present in both. An element the compiler named and the dump
 * does not have is a real finding, but it is a different one -- a screen
 * that did not render it, or a `testID` that did not survive -- and
 * `missingOnDevice` reports it separately rather than as a mismatched role.
 */
export function divergences(
  compiled: Map<string, AnnouncedNode>,
  device: Map<string, AnnouncedNode>,
): Divergence[] {
  const found: Divergence[] = []
  for (const [testID, expected] of compiled) {
    const actual = device.get(testID)
    if (actual === undefined) continue
    // A role the compiler did not ask for is not a divergence: React
    // Native picks a widget for everything, and `View` becoming
    // `ViewGroup` is not a claim about anything.
    if (expected.role !== undefined && expected.role !== actual.role) {
      found.push({ testID, field: 'role', compiled: expected.role, device: actual.role })
    }
    if (expected.name !== undefined && expected.name !== actual.name) {
      found.push({ testID, field: 'name', compiled: expected.name, device: actual.name })
    }
  }
  return found
}

/** Elements the compiler named that the dump does not contain. */
export function missingOnDevice(
  compiled: Map<string, AnnouncedNode>,
  device: Map<string, AnnouncedNode>,
): string[] {
  return [...compiled.keys()].filter((testID) => !device.has(testID)).sort()
}

/**
 * The XCUIElement types that mean a role, and which role they mean.
 *
 * The iOS half of the adapter, and it answers the same question the Android
 * table does from the other side. React Native does not pass a role through
 * as data on iOS either: it sets traits and a type on the view, and
 * `elementType` is what XCUITest reports back.
 *
 * Measured, one row per element that has actually rendered -- the same rule
 * `ANDROID_ROLE_CLASSES` grows by. A row for `checkBox` that nothing has
 * drawn would look exactly like a fact.
 *
 * `staticText` and `other` are deliberately absent. They are what React
 * Native uses for everything it has no widget for, so reporting no role is
 * the honest answer rather than a lost one -- and telling those two apart
 * is what the divergence list is for.
 *
 * There is no `header` row, and not because a heading has none: XCUITest
 * has no public API for accessibility *traits*, so `gallery-Heading` comes
 * back as `staticText` whether or not it carries the header trait. That is
 * a limit of the reader rather than a finding about iOS, and it is the one
 * thing the Android side can say that this one cannot.
 */
export const IOS_ROLE_TYPES: Record<string, string> = {
  button: 'button',
  link: 'link',
  image: 'image',
}

/** One element of the JSON `AccessibilityTreeTests.swift` prints. */
interface IosElement {
  identifier: string
  type: string
  label: string
  value: string
  frame: number[]
  enabled: boolean
}

/**
 * Every element the XCUITest dump exposes, in the shared vocabulary.
 *
 * React Native puts a `testID` in iOS's `accessibilityIdentifier`, which
 * XCUITest reports as `identifier` -- the same join key `resource-id` is on
 * Android, and for the same reason: nothing else in the tree survives
 * compilation recognisably.
 *
 * The collector already dropped the elements with no identifier, which is
 * where iOS's own furniture lives -- the window, the status bar, UIKit's
 * scaffolding. Android's furniture has to be filtered here because its
 * dump names it (`android:id/content`); iOS's is simply nameless.
 */
export function parseIosTree(json: string): Map<string, AnnouncedNode> {
  const byId = new Map<string, AnnouncedNode>()
  for (const element of JSON.parse(json) as IosElement[]) {
    if (!element.identifier) continue
    const role = IOS_ROLE_TYPES[element.type]
    byId.set(element.identifier, {
      testID: element.identifier,
      ...(role === undefined ? {} : { role }),
      ...(element.label ? { name: element.label } : {}),
    })
  }
  return byId
}

/**
 * Elements the compiler names that a resting screen does not draw.
 *
 * Data rather than a special case in a test, because the device job checks
 * the same thing against a fresh tree and the two must not disagree about
 * what counts as expected.
 */
export const ABSENT_AT_REST: Record<string, string> = {
  'smoke-dialog': 'open={confirming}, which is false until Continue is pressed',
}

/**
 * Roles a platform has no way to announce, measured rather than assumed.
 *
 * A divergence here is not a defect to fix: it is a fact about the
 * platform, and the row is where the reason lives. Everything else is a
 * defect, which is what makes the device job's check worth running.
 *
 * The Android side is empty and that is a finding of its own -- every role
 * the acceptance screen asks for survives there. iOS loses `list`: React
 * Native renders it as a plain view, XCUITest reports `other`, and there is
 * no element type in between. The reverse asymmetry is in
 * `android-roles.test.ts`: Android drops every landmark, and iOS was
 * measured doing the same.
 */
export const ROLE_NOT_ON_PLATFORM: Record<string, Record<string, string>> = {
  android: {},
  ios: {
    list: 'React Native renders a list as a plain view on iOS; XCUITest reports `other`',
  },
}

/**
 * The divergences that are defects, with the platform's own limits removed.
 *
 * Shared by the offline fixtures and the device job so that neither can
 * quietly forgive something the other reports.
 */
export function unexplainedDivergences(
  compiled: Map<string, AnnouncedNode>,
  device: Map<string, AnnouncedNode>,
  platform: string,
): Divergence[] {
  const allowed = ROLE_NOT_ON_PLATFORM[platform] ?? {}
  return divergences(compiled, device).filter(
    (divergence) =>
      !(
        divergence.field === 'role' &&
        divergence.device === undefined &&
        divergence.compiled !== undefined &&
        divergence.compiled in allowed
      ),
  )
}

/** Elements missing from the tree that nothing explains. */
export function unexplainedAbsences(
  compiled: Map<string, AnnouncedNode>,
  device: Map<string, AnnouncedNode>,
): string[] {
  return missingOnDevice(compiled, device).filter((testID) => !(testID in ABSENT_AT_REST))
}
