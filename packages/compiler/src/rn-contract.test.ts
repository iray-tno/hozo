import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { Dimensions } from '../../rn-compat/src/dimensions.ts'
import { Keyboard } from '../../rn-compat/src/keyboard.ts'
import { Platform } from '../../rn-compat/src/platform.ts'
import { StyleSheet } from '../../rn-compat/src/stylesheet.ts'
import { analyzeModule } from './analysis.ts'
import { reviewReactNativeMember } from './analysis-rn-contracts.ts'
import { createCompiler } from './index.ts'

function analyze(source: string, policy: 'warn' | 'allow' = 'warn') {
  return analyzeModule(source, {
    compiler: createCompiler(),
    file: 'app.tsx',
    root: '',
    targets: ['web', 'native'],
    unloweredReactNativeJsx: policy,
  })
}

test('reviewed Web adapter entries are anchored to actual exports and source/tests', () => {
  const names = { Platform, StyleSheet, Keyboard, Dimensions }
  const pairs = Object.entries(names).flatMap(([name, object]) =>
    (name === 'Dimensions' ? ['get', 'addEventListener'] : Object.keys(object)).map(
      (member) => `${name}.${member}`,
    ),
  )
  assert.equal(pairs.length, 18)
  const source = `import { Platform, StyleSheet, Keyboard, Dimensions } from 'react-native';
const members = [${pairs.join(',')}];`
  const analysis = analyze(source)
  const journal = analysis.targets.web!.reactNativeValues!
  assert.equal(journal.status, 'completed')
  assert.equal(journal.memberCompatibility, 'not-assessed')
  assert.equal(journal.memberContracts, 'reviewed-web-subsets-v1')
  assert.equal(analysis.targets.native!.reactNativeValues, undefined)
  assert.equal(journal.outcomes.length, 18)
  for (const outcome of journal.outcomes) {
    assert.equal(outcome.disposition, 'rewritten-to-hozo')
    const contract = outcome.memberContract!
    assert.equal(contract.status, 'reviewed-adapter-subset')
    assert.ok(contract.id?.startsWith('web:'))
    assert.ok(contract.summary && contract.nextAction)
    for (const evidence of contract.evidence!) {
      for (const path of [evidence.implementation, evidence.tests]) {
        assert.ok(existsSync(new URL(`../../../${path}`, import.meta.url)), path)
      }
    }
  }
  const byId = new Map(
    journal.outcomes.map((item) => [item.memberContract!.id, item.memberContract!]),
  )
  assert.match(byId.get('web:Platform.Version')!.summary, /placeholder/)
  assert.match(byId.get('web:Keyboard.addListener')!.summary, /no keyboard lifecycle events/)
  assert.match(byId.get('web:StyleSheet.flatten')!.summary, /Numeric style IDs are outside/)
  assert.match(byId.get('web:Dimensions.addEventListener')!.summary, /not device resize/)
})

test('retained API guidance follows actual origins, including nested named members', () => {
  const pairs = [
    'Animated.timing',
    'Animated.Value',
    'Animated.createAnimatedComponent',
    'LayoutAnimation.configureNext',
    'LayoutAnimation.Presets.easeInEaseOut',
    'Alert.alert',
    'AppState.addEventListener',
    'AppState.currentState',
    'Linking.openURL',
    'Image.resolveAssetSource',
  ]
  const result =
    analyze(`import { Animated, LayoutAnimation, Alert, AppState, Linking, Image } from 'react-native';
const values = [${pairs.join(',')}];`)
  const outcomes = result.targets.web!.reactNativeValues!.outcomes
  assert.equal(outcomes.length, 10)
  for (const item of outcomes) {
    assert.equal(item.disposition, 'remains-react-native')
    assert.equal(item.memberContract!.status, 'retained-guidance')
    assert.match(item.memberContract!.id!, /^rn:/)
  }
  assert.match(outcomes[5]!.memberContract!.nextAction, /Do not mechanically replace/)
})

test('aliases keep identity but types, unknown members, values, namespace, dynamic and forwarding do not acquire contracts', () => {
  const source = `// 😀\r\nimport { Platform as P, StyleSheet as S } from 'react-native';
import * as N from 'react-native'; import RN from 'react-native';
const a = P['select']; const b = P[member]; const c = S.nonexistent;
const d = P.OS.extra; const e = N.Platform.OS; const f = RN.Platform.OS;
const g = P; export { P }; type T = typeof P;
function shadow(P) { return P.OS }; const actual = P.OS;`
  const result = analyze(source)
  const journal = result.targets.web!.reactNativeValues!
  assert.equal(journal.outcomes.length, 9)
  assert.equal(journal.typeReferencesExcluded, 1)
  assert.equal(
    journal.outcomes.filter((item) => item.memberContract!.status === 'reviewed-adapter-subset')
      .length,
    2,
  )
  assert.equal(
    journal.outcomes.filter((item) => item.memberContract!.status === 'not-assessed').length,
    7,
  )
  for (const item of journal.outcomes) {
    assert.ok(item.emittedSpan)
    const ref =
      result.reactNativeUsage!.bindings[item.bindingIndex]!.references[item.referenceIndex]!
    assert.equal(
      source.slice(ref.spanStart, ref.spanEnd),
      result.targets.web!.code!.slice(item.emittedSpan!.spanStart, item.emittedSpan!.spanEnd),
    )
  }
  const allowed = analyze(source, 'allow').targets.web!.reactNativeValues!
  assert.equal(allowed.status, 'not-assessed')
  assert.ok(allowed.outcomes.every((item) => item.memberContract === undefined))
})

test('copied handlers may carry contracts; dropped canonical expressions cannot', () => {
  const result = analyze(`import { Platform as P, Pressable } from 'react-native';
const x = <Pressable accessibilityRole="button" disabled={P.OS} onPress={() => P.select({ web: 1 })} />`)
  const outcomes = result.targets.web!.reactNativeValues!.outcomes
  assert.equal(outcomes.length, 2)
  assert.equal(outcomes[0]!.memberContract!.status, 'not-assessed')
  assert.equal(outcomes[1]!.memberContract!.status, 'reviewed-adapter-subset')
  assert.equal(outcomes[1]!.sourceEvidence, 'backend-copied-run')
})

test('report mutations cannot rewrite the registry for later files', () => {
  const source = `import { Platform } from 'react-native'; const os = Platform.OS`
  const first = analyze(source).targets.web!.reactNativeValues!.outcomes[0]!.memberContract!
  first.summary = 'mutated'
  first.evidence![0]!.tests = 'mutated'
  const second = analyze(source).targets.web!.reactNativeValues!.outcomes[0]!.memberContract!
  assert.notEqual(second.summary, 'mutated')
  assert.notEqual(second.evidence![0]!.tests, 'mutated')
})

test('the catalogue cannot invent an origin or review a missing final copy', () => {
  const source = `import { Platform } from 'react-native'; const os = Platform.OS`
  const result = analyze(source)
  const binding = result.reactNativeUsage!.bindings[0]!
  const reference = binding.references[0]!
  const outcome = result.targets.web!.reactNativeValues!.outcomes[0]!
  for (const altered of [
    { ...outcome, replacement: '@hozo/core' },
    { ...outcome, disposition: 'remains-react-native' as const },
    { ...outcome, emittedSpan: undefined },
    { ...outcome, disposition: 'not-assessed' as const },
  ]) {
    assert.equal(reviewReactNativeMember(binding, reference, altered).status, 'not-assessed')
  }
})
