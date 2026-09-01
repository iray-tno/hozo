import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompiler } from './index.ts'
import { lowerModule, namespaceHozoClasses, referencesHozoPrimitive } from './lower.ts'

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
