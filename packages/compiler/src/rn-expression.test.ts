import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeModule } from './analysis.ts'
import { createCompiler } from './index.ts'
import { lowerModule } from './lower.ts'
import { SourceProvenance } from './source-provenance.ts'

function analyze(source: string, compiler = createCompiler()) {
  return analyzeModule(source, { compiler, file: 'app.tsx', root: '', targets: ['web'] })
}

test('copied expressions retain final Unicode offsets through nested replacements and class namespacing', () => {
  const source = `// 😀 日本語\r\nimport { View as V, Text as T, Platform as P, Animated as A } from 'react-native';
const x = <V className="p-4" style={{width: P.OS}} {...{extra: P.select}}
custom={{before: P.OS, css: 'hozo-0', after: P.Version}}
other={<T>{P.OS}<V />{A.timing}</T>}>
<Other onPress={() => P.select({web: A.Value})}>{P.OS}<T>{P.Version}</T></Other></V>`
  const result = analyze(source)
  const web = result.targets.web!
  const journal = web.reactNativeValues!
  assert.equal(web.status, 'completed')
  assert.equal(journal.outputProvenance, 'completed')
  assert.equal(journal.status, 'completed')
  assert.equal(journal.outcomes.length, 10)
  assert.ok(journal.outcomes.every((item) => item.sourceEvidence === 'backend-copied-run'))
  for (const outcome of journal.outcomes) {
    const ref =
      result.reactNativeUsage!.bindings[outcome.bindingIndex]!.references[outcome.referenceIndex]!
    assert.equal(
      source.slice(ref.spanStart, ref.spanEnd),
      web.code!.slice(outcome.emittedSpan!.spanStart, outcome.emittedSpan!.spanEnd),
    )
  }
  assert.equal(
    journal.outcomes.filter((item) => item.disposition === 'rewritten-to-hozo').length,
    8,
  )
  assert.equal(
    journal.outcomes.filter((item) => item.disposition === 'remains-react-native').length,
    2,
  )
  assert.ok(!web.code!.includes("css: 'hozo-0'"))
  assert.equal(createCompiler().compile(source)[0]!.sourceCopies, undefined)
})

test('void children and unrecorded canonical expressions stay unknown while handler values acquire copies', () => {
  const source = `import { TextInput, View, Platform as P } from 'react-native';
const a = <TextInput><View>{P.OS}</View></TextInput>;
const b = <View onPress={() => P.OS} className={P.OS} custom={P.OS} />`
  const result = analyze(source)
  const journal = result.targets.web!.reactNativeValues!
  assert.equal(journal.outcomes.length, 4)
  assert.equal(journal.outcomes.filter((item) => item.disposition === 'not-assessed').length, 2)
  assert.equal(
    journal.outcomes.filter((item) => item.sourceEvidence === 'backend-copied-run').length,
    2,
  )
})

test('renamed, interactive, disabled-link and responder handler values keep their authored scope', () => {
  const source = `// 😀\r\nimport { Pressable, View, Platform as event, LayoutAnimation as A } from 'react-native';
import { Button, Link } from '@hozo/core';
const a = <Pressable accessibilityRole="button" disabled={blocked}
  onPress={() => { event.OS; A.configureNext(A.Presets.easeInEaseOut) }} />;
const b = <Button onPress={event.select} />;
const c = <Link href="/" disabled={blocked} onPress={() => event.OS} />;
const d = <View onResponderGrant={() => A.configureNext()} />`
  const result = analyze(source)
  const web = result.targets.web!
  const journal = web.reactNativeValues!
  assert.equal(web.status, 'completed')
  assert.equal(journal.outcomes.length, 6)
  assert.ok(journal.outcomes.every((item) => item.sourceEvidence === 'backend-copied-run'))
  assert.equal(
    journal.outcomes.filter((item) => item.disposition === 'rewritten-to-hozo').length,
    3,
  )
  assert.equal(
    journal.outcomes.filter((item) => item.disposition === 'remains-react-native').length,
    3,
  )
  assert.match(web.code!, /hozoInteractive\(\(\) => \{ event\.OS;/)
  // The synthetic `event` parameter encloses only the disabled sibling arm,
  // not the copied handler that refers to the imported `event` binding.
  assert.match(web.code!, /\(event\) => event\.preventDefault\(\) : \(\) => event\.OS/)
  for (const outcome of journal.outcomes) {
    const ref =
      result.reactNativeUsage!.bindings[outcome.bindingIndex]!.references[outcome.referenceIndex]!
    assert.equal(
      source.slice(ref.spanStart, ref.spanEnd),
      web.code!.slice(outcome.emittedSpan!.spanStart, outcome.emittedSpan!.spanEnd),
    )
  }
  assert.equal(
    web.code,
    lowerModule(source, 'app.tsx', 'app.tsx', createCompiler(), '', undefined, {
      unloweredReactNativeJsx: 'warn',
    })!.code,
  )
})

test('a collided handler that is not emitted and untraced disabled expressions stay unknown', () => {
  const source = `import { Platform as P, Animated as A, Pressable } from 'react-native';
import { Button } from '@hozo/core';
const a = <Button onPress={() => P.OS} onClick={() => A.timing()} />;
const b = <Pressable accessibilityRole="button" disabled={P.OS} onPress={() => P.select()} />`
  const result = analyze(source)
  const web = result.targets.web!
  const journal = web.reactNativeValues!
  assert.equal(journal.outcomes.length, 4)
  assert.equal(journal.outcomes.filter((item) => item.disposition === 'not-assessed').length, 2)
  assert.equal(
    journal.outcomes.filter((item) => item.sourceEvidence === 'backend-copied-run').length,
    2,
  )
  assert.ok(
    journal.outcomes
      .filter((item) => item.disposition === 'not-assessed')
      .every((item) => item.emittedSpan === undefined),
  )
  assert.ok(result.findings.some((item) => item.code === 'PROP_COLLIDES_WITH_PLATFORM_NAME'))
})

test('malformed backend copy evidence fails the target rather than manufacturing authored provenance', () => {
  const real = createCompiler()
  const source = `import { View, Platform } from 'react-native'; const x = <View>{Platform.OS}</View>`
  const result = analyze(source, {
    ...real,
    compile(...args) {
      return real.compile(...args).map((component) => ({
        ...component,
        sourceCopies: component.sourceCopies?.map((copy) => ({
          ...copy,
          spanEnd: copy.spanEnd + 1,
        })),
      }))
    },
  })
  assert.equal(result.targets.web!.status, 'failed')
  assert.equal(result.targets.web!.reactNativeValues!.status, 'failed')
  assert.ok(
    result.findings.some((item) => item.message.includes('Invalid backend source-copy evidence')),
  )
})

test('source-copy validation refuses invented matches, overlapping emissions and ambiguous duplication', () => {
  const source = 'P.OS'
  for (const copies of [
    [{ spanStart: 0, spanEnd: 4, emittedStart: 0, emittedEnd: 5 }],
    [
      { spanStart: 0, spanEnd: 4, emittedStart: 0, emittedEnd: 4 },
      { spanStart: 0, spanEnd: 4, emittedStart: 2, emittedEnd: 6 },
    ],
  ]) {
    const map = new SourceProvenance(source)
    map.apply(source, [{ spanStart: 0, spanEnd: 4, replacement: 'P.OS + P.OS', copies }])
    assert.equal(map.matches('P.OS + P.OS'), false)
  }
  const duplicated = new SourceProvenance(source)
  duplicated.apply(source, [
    {
      spanStart: 0,
      spanEnd: 4,
      replacement: 'P.OS + P.OS',
      copies: [
        { spanStart: 0, spanEnd: 4, emittedStart: 0, emittedEnd: 4 },
        { spanStart: 0, spanEnd: 4, emittedStart: 7, emittedEnd: 11 },
      ],
    },
  ])
  assert.equal(duplicated.matches('P.OS + P.OS'), true)
  assert.equal(duplicated.emitted('P.OS + P.OS', 0, 4), undefined)
})
