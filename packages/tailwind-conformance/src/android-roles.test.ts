// Which of the roles Hozo emits does Android throw away?
//
// `role="separator"` reaches React Native and stops there.
// `ReactAccessibilityDelegate.kt` maps ARIA roles to Android's
// `AccessibilityRole` with a `when` over about thirty of them and an
// `else -> // No mapping from ARIA role to AccessibilityRole` for the
// rest. There is no `Role.SEPARATOR` arm, so a compiled `<Separator>`
// announces nothing on Android while announcing correctly on Web (#309).
//
// Writing the check found nine more, which is the reason to write checks
// rather than notes: every landmark Hozo emits is in the same position.
// React Native's own C++ parses all of them -- `article`, `navigation`,
// `main` and the rest are in its `Role` enum -- and Android's delegate has
// nowhere to put them, because `AccessibilityRole` has no vocabulary for
// landmarks at all.
//
// What iOS does with them is a separate question this file does not
// answer. VoiceOver's traits are not landmarks either, so the likely
// answer is the same, but "likely" is not what the rest of this package
// trades in and the source that would settle it is a different one.
//
// The decision was to say nothing at build time. A diagnostic that fires
// on every `<Separator/>` in every project, that no author can act on --
// Android has no other spelling -- is the kind of warning teams switch
// off, and then the findings that matter go with it. `text.rs` reasons
// the same way about the font-size default it cannot see.
//
// What silence must not mean is that nobody notices when it changes. So
// the fact is pinned here, against React Native's own source rather than
// a list copied out of it:
//
//   - a role Hozo emits that Android does not map is recorded below;
//   - React Native adding `Role.SEPARATOR` fails this test, which is the
//     day Hozo should start emitting something Android reads;
//   - Hozo emitting a *new* role Android drops fails it too, which is the
//     other direction and the one a person would never think to check.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

import { compileNative } from '@hozo/compiler'

import { declaredPrimitives } from './primitives.ts'

const require = createRequire(import.meta.url)

/** React Native's ARIA-role table, read out of the Kotlin that is it. */
function androidRoleMap(): Set<string> {
  const root = path.dirname(require.resolve('react-native/package.json'))
  const file = path.join(
    root,
    'ReactAndroid',
    'src',
    'main',
    'java',
    'com',
    'facebook',
    'react',
    'uimanager',
    'ReactAccessibilityDelegate.kt',
  )
  const source = readFileSync(file, 'utf8')
  const arms = [...source.matchAll(/Role\.([A-Z_]+)\s*->/g)].map(([, name]) =>
    (name as string).toLowerCase(),
  )
  assert.ok(
    arms.length > 20,
    `only ${arms.length} role arms found; the file moved or changed shape`,
  )
  return new Set(arms)
}

/** Every `role="…"` the Native backend emits, over every primitive. */
function rolesHozoEmits(): Set<string> {
  const roles = new Set<string>()
  for (const primitive of declaredPrimitives()) {
    const source = `import { ${primitive} } from '@hozo/core'\nexport function F() { return <${primitive} /> }`
    let compiled: { jsx: string }[]
    try {
      compiled = compileNative(source, 'F.tsx') as { jsx: string }[]
    } catch {
      // A primitive that needs more than an empty element is covered by
      // the contract cases in `a11y-contextual.ts`; this is about roles,
      // and one that cannot be rendered bare emits none here.
      continue
    }
    for (const { jsx } of compiled) {
      for (const [, role] of jsx.matchAll(/\srole="([a-z]+)"/g)) roles.add(role as string)
    }
  }
  return roles
}

/**
 * The roles Hozo emits that Android has no mapping for.
 *
 * Nine of the ten are landmarks -- the structure a screen reader on the
 * Web uses to jump around a page -- and Android's `AccessibilityRole` is a
 * list of *widgets*. There is nothing to emit instead: TalkBack navigates
 * by heading and by control, and a `<Nav>` is neither.
 *
 * `separator` is the tenth and the one #309 found, by looking at a device
 * rather than at this table.
 *
 * Each entry is a decision that the silence is acceptable, not a list to
 * append to when a test goes red. A new one means a primitive announces
 * itself on one platform and not the other, and that is worth reading
 * about before it is written down.
 */
const DISCARDED_ON_ANDROID = [
  'article',
  'banner',
  'complementary',
  'contentinfo',
  'figure',
  'group',
  'listitem',
  'main',
  'navigation',
  'separator',
]

test('React Native still has no Android mapping for the roles we know it drops', () => {
  const mapped = androidRoleMap()
  for (const role of DISCARDED_ON_ANDROID) {
    assert.equal(
      mapped.has(role),
      false,
      `React Native now maps \`${role}\` on Android. The silence in hozo_native is no longer ` +
        'correct: emit what Android reads, and take this role off the list.',
    )
  }
})

test('and the compiler emits nothing else Android would throw away', () => {
  // The direction nobody would think to check: a new primitive, or a new
  // role on an old one, that Android silently discards the way `separator`
  // is discarded. Adding it here is a decision -- write down why the
  // silence is acceptable for that role too -- rather than a formality.
  const mapped = androidRoleMap()
  const dropped = [...rolesHozoEmits()].filter((role) => !mapped.has(role)).sort()
  assert.deepEqual(
    dropped,
    [...DISCARDED_ON_ANDROID].sort(),
    "a role Hozo emits is not in React Native's Android table, so it announces nothing there",
  )
})

test('the roles Android does map are ones it maps for a reason', () => {
  // A guard on the reader above rather than on React Native: a regex that
  // matched nothing, or matched the wrong thing, would make both tests
  // above pass by finding an empty table.
  const mapped = androidRoleMap()
  for (const role of ['button', 'link', 'heading', 'progressbar', 'none']) {
    assert.ok(
      mapped.has(role),
      `\`${role}\` is missing: the Kotlin reader is reading the wrong thing`,
    )
  }
})
