import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompiler } from './index.ts'
import {
  foldedPrimitiveCalls,
  lowerModule,
  namespaceHozoClasses,
  referencesHozoPrimitive,
} from './lower.ts'

/** Every test names its files relative to this, as a project does. */
const ROOT = ''

const file = 'Page.tsx'
const compiler = createCompiler()

test('lowers a component and namespaces its classes', () => {
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function Page() { return <View className="p-4">x</View> }\n`
  const lowered = lowerModule(source, file, file, compiler, ROOT)

  assert.ok(lowered)
  assert.match(lowered.code, /<div/)
  assert.match(lowered.code, /hozo-[a-z0-9]+-r0-0\b/)
  assert.match(lowered.css, /\.hozo-[a-z0-9]+-r0-0\b/)
  assert.equal(lowered.cssFileName, 'Page.tsx.hozo.css')
})

test('leaves alone what it has nothing to do with', () => {
  assert.equal(lowerModule('export const x = 1\n', file, file, compiler, ROOT), undefined)
  const notTsx = "import { View } from '@hozo/core'\n"
  assert.equal(lowerModule(notTsx, 'a.ts', 'a.ts', compiler, ROOT), undefined)
})

test('unloweredReactNativeJsx error policy refuses a direct React Native JSX binding left in Web output', () => {
  const source = `import { SectionList as Rows } from 'react-native'
export const Page = () => <Rows sections={sections} renderItem={renderItem} />
`

  assert.equal(lowerModule(source, file, file, compiler, ROOT), undefined)
  assert.throws(
    () =>
      lowerModule(source, file, file, compiler, ROOT, undefined, {
        unloweredReactNativeJsx: 'error',
      }),
    /UNLOWERED_REACT_NATIVE_JSX: Web output still contains JSX backed directly by 'react-native' after lowering: SectionList as Rows/,
  )
})

test('unloweredReactNativeJsx warn policy emits a warning diagnostic and does not throw', () => {
  const source = `import { SectionList as Rows } from 'react-native'
export const Page = () => <Rows sections={sections} renderItem={renderItem} />
`

  const lowered = lowerModule(source, file, file, compiler, ROOT, undefined, {
    unloweredReactNativeJsx: 'warn',
  })
  assert.ok(lowered)
  assert.equal(lowered.diagnostics.length, 1)
  assert.equal(lowered.diagnostics[0]?.code, 'UNLOWERED_REACT_NATIVE_JSX')
  assert.equal(lowered.diagnostics[0]?.severity, 'warning')
  assert.match(
    lowered.diagnostics[0]?.message ?? '',
    /Web output still contains JSX backed directly by 'react-native' after lowering: SectionList as Rows/,
  )
})

test('unloweredReactNativeJsx accepts supported bindings and ignores non-JSX mentions', () => {
  const source = `import { View, SectionList } from 'react-native'
type Props = { component?: typeof SectionList }
// <SectionList> in documentation is not rendered JSX.
export const Page = () => <View />
`

  const lowered = lowerModule(source, file, file, compiler, ROOT, undefined, {
    unloweredReactNativeJsx: 'error',
  })
  assert.ok(lowered)
  assert.match(lowered.code, /<div/)
})

test('unloweredReactNativeJsx rehomes StyleSheet while preserving values and types', () => {
  const source = `import { useMemo } from 'react'
import { type ViewStyle, StyleSheet as Sheet, View } from 'react-native'
const styles = Sheet.create({ card: { padding: 4 } })
export const Page = () => <View style={useMemo(() => styles.card, [])} />
`
  const lowered = lowerModule(source, file, file, compiler, ROOT, undefined, {
    unloweredReactNativeJsx: 'error',
  })!
  assert.match(lowered.code, /import \{ useMemo \} from 'react'/)
  assert.match(lowered.code, /import \{ type ViewStyle, View \} from 'react-native'/)
  assert.match(lowered.code, /import \{ StyleSheet as Sheet \} from '@hozo\/runtime'/)
  assert.match(lowered.code, /Sheet\.create/)
})

test('unloweredReactNativeJsx API lowering also transforms non-JSX TypeScript modules', () => {
  const source = `import { StyleSheet } from 'react-native'
export const flatten = StyleSheet.flatten
`
  const lowered = lowerModule(source, 'styles.ts', 'styles.ts', compiler, ROOT, undefined, {
    unloweredReactNativeJsx: 'error',
  })!
  assert.match(lowered.code, /from '@hozo\/runtime'/)
  assert.equal(lowered.css, '')
  assert.equal(lowered.needsClientBoundary, false)
})

test('unloweredReactNativeJsx API lowering can move more than one owned runtime value', () => {
  const source = `import { Keyboard, Platform, StyleSheet, View } from 'react-native'
const styles = StyleSheet.create({ card: { padding: Platform.select({ web: 8, default: 4 }) } })
export const Page = () => <View onClick={() => Keyboard.dismiss()} style={styles.card} />
`
  const lowered = lowerModule(source, file, file, compiler, ROOT, undefined, {
    unloweredReactNativeJsx: 'error',
  })!
  assert.match(lowered.code, /import \{ View \} from 'react-native'/)
  assert.match(lowered.code, /import \{ Keyboard, Platform, StyleSheet \} from '@hozo\/runtime'/)
})

test('unloweredReactNativeJsx rehomes viewport values and preserves dimension types', () => {
  const source = `import { Dimensions, type ScaledSize, useWindowDimensions as useSize } from 'react-native'
export const initial: ScaledSize = Dimensions.get('window')
export const useWidth = () => useSize().width
`
  const lowered = lowerModule(source, 'viewport.ts', 'viewport.ts', compiler, ROOT, undefined, {
    unloweredReactNativeJsx: 'error',
  })!
  assert.match(lowered.code, /import \{ type ScaledSize \} from 'react-native'/)
  assert.match(
    lowered.code,
    /import \{ Dimensions, useWindowDimensions as useSize \} from '@hozo\/runtime'/,
  )
  assert.match(lowered.code, /Dimensions\.get\('window'\)/)
  assert.match(lowered.code, /useSize\(\)\.width/)
})

test('unloweredReactNativeJsx rehomes a TextInput that remains a runtime component value', () => {
  const source = `import { TextInput, View } from 'react-native'
const Field = makeField(TextInput)
export const Page = () => <View><TextInput accessibilityLabel="Name" /><Field /></View>
`
  const lowered = lowerModule(source, file, file, compiler, ROOT, undefined, {
    unloweredReactNativeJsx: 'error',
  })!
  assert.match(lowered.code, /import \{ View \} from 'react-native'/)
  assert.match(lowered.code, /import \{ TextInput \} from '@hozo\/runtime'/)
  assert.match(lowered.code, /const Field = makeField\(TextInput\)/)
  assert.match(lowered.code, /<input aria-label=\{"Name"\}/)
  assert.equal(lowered.needsClientBoundary, false)
})

test('unloweredReactNativeJsx rehomes a Pressable wrapped as a runtime component value', () => {
  const source = `import { Pressable, View } from 'react-native'
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
export const Page = () => <View><Pressable onPress={save} /><AnimatedPressable /></View>
`
  const lowered = lowerModule(source, file, file, compiler, ROOT, undefined, {
    unloweredReactNativeJsx: 'error',
  })!
  assert.match(lowered.code, /import \{ View \} from 'react-native'/)
  assert.match(lowered.code, /import \{ Pressable \} from '@hozo\/runtime'/)
  assert.match(lowered.code, /createAnimatedComponent\(Pressable\)/)
  assert.doesNotMatch(lowered.code, /<Pressable\b/)
})

test('unloweredReactNativeJsx identifies namespace JSX by its imported root', () => {
  const source = `import * as RN from 'react-native'
export const Page = () => <RN.SectionList sections={sections} renderItem={renderItem} />
`

  assert.throws(
    () =>
      lowerModule(source, file, file, compiler, ROOT, undefined, {
        unloweredReactNativeJsx: 'error',
      }),
    /UNLOWERED_REACT_NATIVE_JSX: Web output still contains JSX backed directly by 'react-native' after lowering: \* as RN/,
  )
})

test('normalizes React Native style props only on lowered DOM elements', () => {
  const source = `import { View } from 'react-native'
const props = { id: 'card' }
export function Page() {
  return <View style={[{ padding: 4 }, false, { padding: 8 }]} {...props} />
}
`
  const lowered = lowerModule(source, file, file, compiler, ROOT)!
  assert.match(
    lowered.code,
    /style=\{hozoDomStyle\(\[\{ padding: 4 \}, false, \{ padding: 8 \}\]\)\}/,
  )
  assert.match(lowered.code, /\{\.\.\.hozoDomProps\(props\)\}/)
  assert.match(lowered.code, /import \{ hozoDomProps, hozoDomStyle \} from '@hozo\/runtime'/)
})

test('adds no DOM style runtime to an element without inline style or prop spreads', () => {
  const source = `import { View } from 'react-native'
export function Page() { return <View className="p-4" /> }
`
  const lowered = lowerModule(source, file, file, compiler, ROOT)!
  assert.doesNotMatch(lowered.code, /hozoDom(?:Props|Style)/)
})

test('a derived module gets its own companion stylesheet', () => {
  // Route-splitting frameworks transform several query-qualified modules
  // from one source file, and each owns different JSX -- one shared path
  // would let the last transform overwrite the others' CSS.
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function Page() { return <View className="p-4">x</View> }\n`
  const plain = lowerModule(source, file, file, compiler, ROOT)!
  const derived = lowerModule(source, `${file}?ssr=true`, file, compiler, ROOT)!
  assert.notEqual(plain.cssFileName, derived.cssFileName)
  assert.match(derived.cssFileName, /^Page\.tsx\..+\.hozo\.css$/)
})

test('keeps the @hozo/core import when a primitive survived lowering', () => {
  // Regression, and it broke at *runtime* rather than at build: a stray
  // template literal turned `\b` into a backspace character, so the word
  // boundary matched nothing, `referencesHozoPrimitive` answered "no" for
  // every input, and the import was stripped out from under a
  // `PanResponder` the compiler had deliberately carried through.
  assert.ok(referencesHozoPrimitive('const pan = PanResponder.create({})'))
  assert.ok(referencesHozoPrimitive('const Label = Text\n'))
  assert.ok(!referencesHozoPrimitive('const x = 1\n'))
  // A word match, so a longer identifier that merely contains one is not
  // a reference.
  assert.ok(!referencesHozoPrimitive('const ViewModel = 1\n'))

  const source =
    `import { PanResponder, View } from '@hozo/core'\n` +
    `const pan = PanResponder.create({})\n` +
    `export function Page() { return <View className="p-4">x</View> }\n`
  const lowered = lowerModule(source, file, file, compiler, ROOT)!
  assert.ok(lowered.code.includes('@hozo/core'), 'the import a survivor needs was stripped')
})

test('the import survives even when lowering left nothing using it', () => {
  // Not an oversight: the import statement is part of the text
  // `referencesHozoPrimitive` searches, so it always finds one. What
  // removes the module from the bundle is the bundler's own
  // unused-specifier elision, which cannot be wrong the way a regex can.
  // Asserted so that a future attempt to make the strip "work" has to
  // face what it would break.
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function Page() { return <View className="p-4">x</View> }\n`
  const lowered = lowerModule(source, file, file, compiler, ROOT)!
  assert.ok(lowered.code.includes('@hozo/core'))
  assert.ok(!/<View/.test(lowered.code), 'the tag itself should be gone')
})

test('namespacing leaves the shared base class alone', () => {
  assert.equal(namespaceHozoClasses('hozo-view hozo-0', 2, 'abc'), 'hozo-view hozo-abc-r2-0')
})

test('lowers Canvas paint classes without treating the scene as semantic DOM', () => {
  const source = `import { Canvas } from '@hozo/canvas'
export function Chart() {
  return <Canvas decorative width={100} height={40}>
    <Canvas.Rect className="fill-blue-500 stroke-red-500 stroke-2 opacity-50" width={100} height={40} />
  </Canvas>
}
`
  const lowered = lowerModule(source, file, file, compiler, ROOT)!
  assert.ok(lowered)
  assert.match(lowered.code, /<Canvas decorative/)
  assert.match(
    lowered.code,
    /<Canvas\.Rect fill="oklch\(62\.3% 0\.214 259\.815\)" stroke="oklch\(63\.7% 0\.237 25\.331\)" strokeWidth=\{2\} opacity=\{0\.5\}/,
  )
  assert.equal(lowered.css, '')
})

test('Canvas paint survives inside a semantic root that is rewritten afterward', () => {
  const source = `import { View } from '@hozo/core'
import { Canvas } from '@hozo/canvas'
export function Chart() {
  return <View className="p-4"><Canvas decorative width={20} height={20}><Canvas.Circle className="fill-blue-500" cx={10} cy={10} radius={8} /></Canvas></View>
}
`
  const lowered = lowerModule(source, file, file, compiler, ROOT)!
  assert.match(lowered.code, /<div[^>]*><Canvas decorative/)
  assert.match(lowered.code, /<Canvas\.Circle fill="oklch\(62\.3% 0\.214 259\.815\)"/)
})

test('diagnoses Canvas classes that have no paint-prop lowering', () => {
  const source = `import { Canvas } from '@hozo/canvas'
const Chart = () => <Canvas decorative><Canvas.Rect className={active ? 'fill-blue-500' : 'fill-gray-500'} width={1} height={1} /></Canvas>
`
  const lowered = lowerModule(source, file, file, compiler, ROOT)!
  assert.equal(lowered.code, source)
  assert.equal(lowered.diagnostics[0]?.code, 'CANVAS_CLASS_NOT_LOWERED')
})

test('two modules never answer to the same class name', () => {
  // The assertion that was missing, and it would have failed from the day
  // the second example was written. Class names were namespaced per root
  // and not per module, so every file started again at `hozo-r0-0` and the
  // companion stylesheets all land in one document. In the Storybook demo
  // six of them defined `.hozo-r0-8` with six unrelated rule sets, and an
  // `<article>` whose only class was `space-y-2` rendered on the
  // destructive button's red.
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function A() { return <View className="p-4"><View className="gap-2" /></View> }\n`
  const first = lowerModule(source, 'src/A.tsx', 'src/A.tsx', compiler, ROOT)!
  const second = lowerModule(source, 'src/B.tsx', 'src/B.tsx', compiler, ROOT)!

  const names = (css: string) => new Set(css.match(/hozo-[\w-]+/g) ?? [])
  const shared = [...names(first.css)].filter((name) => names(second.css).has(name))
  // `hozo-view` and its wordless siblings are the intentionally shared
  // base classes; anything carrying digits is one module's own.
  assert.deepEqual(
    shared.filter((name) => /\d/.test(name)),
    [],
    'two modules produced the same generated class name',
  )
  assert.ok(shared.includes('hozo-view'), 'the shared base class stopped being shared')
})

test('the same source compiles to the same class names on any machine', () => {
  // Keyed on the path relative to the project root, not the absolute id.
  // Hashing the id would have been less code and would have made a
  // checkout's location part of its output -- CI and a developer's machine
  // producing different CSS for the same commit.
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function A() { return <View className="p-4" /> }\n`
  const a = '/home/dev/app'
  const b = '/ci/build/9'
  const here = lowerModule(source, `${a}/src/A.tsx`, `${a}/src/A.tsx`, compiler, a)!
  const there = lowerModule(source, `${b}/src/A.tsx`, `${b}/src/A.tsx`, compiler, b)!
  assert.equal(here.css, there.css)
})

test('a derived module gets class names of its own, not just a stylesheet', () => {
  // Same file, different JSX per query-qualified module. Their stylesheets
  // already had separate paths; without the query in the scope the rules
  // inside them would still have collided.
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function Page() { return <View className="p-4" /> }\n`
  const plain = lowerModule(source, file, file, compiler, ROOT)!
  const derived = lowerModule(source, `${file}?ssr=true`, file, compiler, ROOT)!
  assert.notEqual(plain.css, derived.css)
})

test('a component survives text that is not ASCII', () => {
  // The splice is `slice(0, spanStart) + jsx + slice(spanEnd)`, and the
  // spans arrive from a Rust parser that counts UTF-8 bytes while a
  // JavaScript string is indexed in UTF-16 code units. Every non-ASCII
  // character before the end of a span pushed the cut further right, so
  // the source *after* the component was deleted -- two characters per em
  // dash, ten for a five-character Japanese word.
  //
  // Found by writing one em dash into a Storybook story. Every fixture in
  // this repository was ASCII, so `pnpm test` was 25/25 green with it.
  for (const text of ['a — b — c —', 'こんにちは', 'hi 🚀', 'café']) {
    const source =
      `import { View, Text } from '@hozo/core'\n` +
      `export function Page() {\n` +
      `  return (\n` +
      `    <View className="p-4"><Text className="text-sm">${text}</Text></View>\n` +
      `  )\n` +
      `}\n` +
      `export const after = 1\n`
    const lowered = lowerModule(source, file, file, compiler, ROOT)!
    assert.ok(lowered, text)
    assert.match(lowered.code, /export const after = 1/, `${text}: the tail of the file was eaten`)
    assert.match(lowered.code, /\)\n\}/, `${text}: the function was left unclosed`)
    assert.ok(lowered.code.includes(text), `${text}: the text itself did not survive`)
  }
})

test('text before a component does not shift where it is spliced', () => {
  // `spanStart` is wrong in the same direction, which cuts into the
  // opening tag rather than past the closing one.
  const source =
    `import { View } from '@hozo/core'\n` +
    `export const note = '— — — — —'\n` +
    `export function Page() {\n` +
    `  return <View className="p-4" />\n` +
    `}\n`
  const lowered = lowerModule(source, file, file, compiler, ROOT)!
  assert.ok(lowered)
  assert.match(lowered.code, /export const note = '— — — — —'/, 'the string before it was cut')
  assert.match(lowered.code, /return <div /, 'the component did not lower cleanly')
})

/** Compiles one usage and answers the only question these tests ask. */
function needsClient(usage: string): boolean {
  const imports =
    'View, Text, Paragraph, Heading, Section, Article, Nav, List, ListItem, ' +
    'Image, Link, Pressable, Button, TextInput, ScrollView, Dialog, FlatList'
  const source = `import { ${imports} } from '@hozo/core'\nexport function C() { return ${usage} }\n`
  const lowered = lowerModule(source, file, file, compiler, ROOT)
  assert.ok(lowered, `nothing lowered for: ${usage}`)
  return lowered.needsClientBoundary
}

test('the static subset is reported as needing no client boundary', () => {
  // The eleven primitives that lower to markup which runs on a server
  // alone. `apps/landing` renders them from Astro with no `client:`
  // directive and ships no JavaScript; this is the same claim, asked of
  // the compiler rather than of a built page.
  for (const usage of [
    '<View className="p-4" />',
    '<Text className="text-xl">hi</Text>',
    '<Paragraph>hi</Paragraph>',
    '<Heading level={2}>hi</Heading>',
    '<Section><Text>hi</Text></Section>',
    '<Article><Text>hi</Text></Article>',
    '<Nav accessibilityLabel="Primary" />',
    '<List ordered><ListItem>a</ListItem></List>',
    '<Image src="/a.png" alt="A" />',
    '<Link href="/next">go</Link>',
  ]) {
    assert.equal(needsClient(usage), false, usage)
  }
})

test('everything that needs script is reported as needing it', () => {
  // Each for a different reason, which is why they are listed rather than
  // summarised: a runtime import for the first, third and fifth, an event
  // handler on a lowered element for the second and fourth, and for
  // `FlatList` a primitive the Web backend carries rather than lowers --
  // so `@hozo/core`'s own component runs.
  for (const usage of [
    '<Pressable onPress={save}><Text>x</Text></Pressable>',
    '<Button onPress={save}>Save</Button>',
    '<ScrollView><Text>a</Text></ScrollView>',
    '<TextInput value={v} onChangeText={setV} />',
    '<Dialog visible={open}><Text>a</Text></Dialog>',
    '<FlatList data={rows} renderItem={render} />',
  ]) {
    assert.equal(needsClient(usage), true, usage)
  }
})

test('one interactive primitive is enough to need a boundary', () => {
  // The regression the fact exists for. Ten static primitives and a
  // button: in Astro that renders `<button type="button">` with the
  // handler dropped, no error at build or at run time, and a control that
  // looks right and does nothing.
  assert.equal(
    needsClient('<Section><Text>a</Text><Button onPress={save}>Save</Button></Section>'),
    true,
  )
})

// What `foldedPrimitiveCalls` is for: an MDX plugin that was not told
// `jsx: true` hands Hozo function calls instead of JSX. `@astrojs/mdx`
// has no such option to be told (#137).
//
// Most of these now compile -- `Compiler.unfoldJsxCalls` writes them back
// as JSX before lowering reads them, and `@hozo/vite` folds them again on
// the way out. This function is asked of the *un-folded* text, so what it
// still names is what has no JSX spelling at all. The fixture below is the
// input to that, and it is still the right question to ask of a module:
// which primitives are folded here.
const FOLDED = `import {Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs} from "react/jsx-runtime";
import {View, Text} from '@hozo/core';
function _createMdxContent(props) {
  const _components = { h1: "h1", ...props.components };
  return _jsxs(_Fragment, {
    children: [_jsx(_components.h1, { children: "A catalogue page" }), "\n", _jsx(View, {
      className: "p-4",
      children: _jsx(Text, { className: "text-xl", children: "inline in MDX" })
    })]
  });
}
`

test('names the primitives an MDX plugin folded to calls before Hozo saw them', () => {
  assert.deepEqual(foldedPrimitiveCalls(FOLDED, compiler.sources), ['Text', 'View'])
})

test('the development runtime spells it differently and counts the same', () => {
  // A Vite dev server emits `jsxDEV`, not `jsx` -- which is what it
  // actually produced the first time this ran against one. A check that
  // knew only the production spelling would be right in a build and blind
  // in the place people work.
  const dev = FOLDED.replaceAll('_jsx(', '_jsxDEV(').replaceAll('_jsxs(', '_jsxDEV(')
  assert.deepEqual(foldedPrimitiveCalls(dev, compiler.sources), ['Text', 'View'])
})

test('the name at the call site is the one that is reported', () => {
  const aliased = `import { View as Box } from '@hozo/core'\nconst x = _jsx(Box, { className: "p-4" })\n`
  assert.deepEqual(foldedPrimitiveCalls(aliased, compiler.sources), ['Box'])
})

test('a primitive-shaped name from a module the project does not trust is left alone', () => {
  // The same rule the compiler applies per tag. `@expo/ui` exports a
  // `Button` that shares nothing with Hozo's but its spelling, and a
  // folded one of those is the correct outcome rather than a loss.
  const expo = `import { Button } from '@expo/ui'\nconst x = _jsx(Button, { label: "Save" })\n`
  assert.deepEqual(foldedPrimitiveCalls(expo, compiler.sources), [])
})

test('JSX that reached Hozo as JSX is not folded', () => {
  const jsx = `import { View } from '@hozo/core'\nexport const P = () => <View className="p-4" />\n`
  assert.deepEqual(foldedPrimitiveCalls(jsx, compiler.sources), [])
})

test('a member expression is not a bound name', () => {
  // `_jsx(_components.h1, …)` is every heading in a folded MDX document,
  // and none of them is a Hozo primitive.
  assert.deepEqual(
    foldedPrimitiveCalls(
      `import { View } from '@hozo/core'\nconst x = _jsx(_components.h1, {})\n`,
      compiler.sources,
    ),
    [],
  )
})
