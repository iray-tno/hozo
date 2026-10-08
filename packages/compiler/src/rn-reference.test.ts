import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeModule } from './analysis.ts'
import { reactNativeReferenceJournal } from './analysis-rn-references.ts'
import { analyzeReactNativeUsage, createCompiler } from './index.ts'
import { SourceProvenance } from './source-provenance.ts'

function analyze(source: string, compiler = createCompiler(), policy: 'warn' | 'allow' = 'warn') {
  return analyzeModule(source, {
    compiler,
    file: 'app.tsx',
    root: '',
    targets: ['web', 'native'],
    unloweredReactNativeJsx: policy,
  })
}

test('actual JSX emissions join aliases and Unicode after preceding import/Canvas edits', () => {
  const source = `// 😀 日本語\r\nimport { Platform as P, View as 箱, Text as T, Animated as A } from 'react-native'
import { Canvas } from '@hozo/canvas'
const drawing = <Canvas><Canvas.Rect className="fill-red-500" /></Canvas>
const tree = <箱 custom={{ factory: 箱, os: P.OS }}><Other>{yes && <T>{P.OS}</T>}</Other><A.View /></箱>
const factory = 箱; const timing = A.timing`
  const result = analyze(source)
  assert.equal(result.targets.web!.status, 'completed')
  const journal = result.targets.web!.reactNativeReferences!
  assert.equal(journal.status, 'completed')
  assert.equal(journal.unmappedTags, 0)
  const bindings = result.reactNativeUsage!.bindings
  const resolved = journal.outcomes.map((outcome) => ({
    ...outcome,
    reference: bindings[outcome.bindingIndex]!.references[outcome.referenceIndex]!,
  }))
  const tags = resolved.filter((item) => item.reference.access === 'jsx')
  assert.equal(tags.length, 5)
  assert.ok(tags.every((item) => item.disposition === 'replaced-jsx-tag'))
  assert.deepEqual(
    tags.map((item) => item.replacement).sort(),
    ['HozoAnimatedView', 'div', 'div', 'span', 'span'].sort(),
  )
  assert.ok(
    resolved
      .filter((item) => item.reference.access !== 'jsx')
      .every((item) => item.disposition === 'not-assessed'),
  )
  assert.equal(
    result.targets.web!.reactNativeImports!.outcomes.find(
      (item) => bindings[item.bindingIndex]!.local === '箱',
    )!.disposition,
    'retained-react-native',
  )
  assert.equal(result.targets.native!.reactNativeReferences, undefined)
  const plain = createCompiler().compile(source, undefined, { rehomeReactNative: true })
  assert.ok(plain.every((component) => component.tagDecisions === undefined))
})

test('preserved emitted spelling is not an RN dependency claim; allow can still lower tags', () => {
  const source = `import { Pressable, TextInput, View } from 'react-native'; const x = <View><Pressable {...pan.panHandlers} /><TextInput /></View>`
  const result = analyze(source)
  const journal = result.targets.web!.reactNativeReferences!
  assert.equal(journal.status, 'completed')
  const pressable = journal.outcomes.find(
    (item) => result.reactNativeUsage!.bindings[item.bindingIndex]!.local === 'Pressable',
  )!
  assert.equal(pressable.disposition, 'preserved-jsx-tag')
  assert.equal(pressable.replacement, 'Pressable')
  assert.equal(result.targets.web!.reactNativeImports!.outcomes[0]!.replacement, '@hozo/core')
  const allowed = analyze(source, createCompiler(), 'allow')
  assert.equal(allowed.targets.web!.reactNativeImports!.status, 'not-assessed')
  assert.equal(allowed.targets.web!.reactNativeReferences!.status, 'completed')
  assert.ok(
    allowed.targets.web!.reactNativeReferences!.outcomes.some(
      (item) => item.disposition === 'replaced-jsx-tag',
    ),
  )
})

test('factories, types, unsupported namespace JSX and lexically shadowed names are not guessed', () => {
  const source = `import { View, Animated } from 'react-native'; import * as RN from 'react-native';
type Factory = typeof View; const factory = View; function local(View) { return <View /> }
const x = <View>{factory}<RN.View /><Animated.Text /></View>`
  const result = analyze(source)
  const journal = result.targets.web!.reactNativeReferences!
  assert.equal(journal.status, 'completed')
  const replaced = journal.outcomes.filter((item) => item.disposition === 'replaced-jsx-tag')
  assert.equal(replaced.length, 2)
  assert.ok(
    journal.outcomes
      .filter((item) => result.reactNativeUsage!.bindings[item.bindingIndex]!.imported !== 'View')
      .every((item) => item.disposition === 'not-assessed'),
  )
})

test('void emission consumes a closing name without claiming discarded children', () => {
  const result = analyze(
    `import { TextInput as Input, Text } from 'react-native'; const x = <Input><Text>lost</Text></Input>`,
  )
  const journal = result.targets.web!.reactNativeReferences!
  // Exercise the backend void branch with import rehoming disabled too: the
  // tag evidence is independent of the import policy.
  const allowed = analyze(
    `import { TextInput as Input, Text } from 'react-native'; const x = <Input><Text>lost</Text></Input>`,
    createCompiler(),
    'allow',
  )
  assert.equal(journal.status, 'completed')
  const outcomes = allowed.targets.web!.reactNativeReferences!.outcomes
  assert.equal(outcomes.filter((item) => item.disposition === 'removed-jsx-tag').length, 1)
  assert.equal(outcomes.filter((item) => item.disposition === 'not-assessed').length, 2)
})

test('unmapped generated spans and missing evidence cannot produce complete tag claims', () => {
  const source = `import { View } from 'react-native'; const x = <View />`
  const usage = { ...analyzeReactNativeUsage(source), status: 'completed' as const }
  const journal = reactNativeReferenceJournal(source, usage)
  journal.edits(source, [{ spanStart: 0, spanEnd: source.length, replacement: source }])
  journal.semantic(
    'unrelated input',
    createCompiler().compile(source, undefined, { tagEvidence: true }),
  )
  assert.equal(journal.finish(true).status, 'partial')
  assert.equal(journal.analysis.unmappedTags, 1)
  assert.equal(journal.analysis.outcomes[0]!.disposition, 'not-assessed')
  const missing = reactNativeReferenceJournal(source, usage)
  missing.semantic(source, createCompiler().compile(source))
  assert.equal(missing.finish(true).status, 'partial')
})

test('a later pipeline failure preserves tag evidence but is not a successful rewrite verdict', () => {
  const source = `import { View } from 'react-native'; const x = <View />`
  const real = createCompiler()
  let calls = 0
  const result = analyze(source, {
    ...real,
    compileNativeModule(...args) {
      if (++calls > 1) throw new Error('controlled residue failure')
      return real.compileNativeModule(...args)
    },
  })
  assert.equal(result.targets.web!.status, 'failed')
  assert.equal(result.targets.web!.reactNativeReferences!.status, 'failed')
  assert.equal(
    result.targets.web!.reactNativeReferences!.outcomes[0]!.disposition,
    'replaced-jsx-tag',
  )
})

test('source provenance carries UTF-16 runs through sequential splices and refuses generated lookalikes', () => {
  const source = '😀abc<View /> tail'
  const map = new SourceProvenance(source)
  map.apply(source, [{ spanStart: 2, spanEnd: 5, replacement: 'long prefix' }])
  const next = '😀long prefix<View /> tail'
  assert.deepEqual(map.authored(next, 14, 18), { spanStart: 6, spanEnd: 10 })
  assert.equal(map.authored(next, 2, 6), undefined)
  map.apply(next, [{ spanStart: 14, spanEnd: 18, replacement: 'View' }])
  assert.deepEqual(map.authored(next, 14, 18), { spanStart: 6, spanEnd: 10 })
  map.apply(next, [{ spanStart: 14, spanEnd: 18, replacement: 'Text' }])
  assert.equal(map.authored(next.replace('View', 'Text'), 14, 18), undefined)
  const invalid = new SourceProvenance(source)
  invalid.apply(source, [{ spanStart: 4, spanEnd: 2, replacement: '' }])
  assert.equal(invalid.authored(source, 6, 10), undefined)
})
