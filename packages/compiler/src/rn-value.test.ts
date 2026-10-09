import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeModule } from './analysis.ts'
import { reactNativeValueJournal } from './analysis-rn-values.ts'
import { analyzeReactNativeUsage, createCompiler } from './index.ts'
import { lowerModule } from './lower.ts'
import { SourceProvenance } from './source-provenance.ts'

function analyze(source: string, file = 'app.tsx', policy: 'warn' | 'allow' = 'warn') {
  return analyzeModule(source, {
    compiler: createCompiler(),
    file,
    root: '',
    targets: ['web', 'native'],
    unloweredReactNativeJsx: policy,
  })
}

test('unchanged values join final offsets through imports, Canvas, multiple roots and generated helpers', () => {
  const source = `// 😀 日本語\r\nimport { Platform as P, View as 箱, TextInput as I, Animated as A } from 'react-native'
import { Canvas } from '@hozo/canvas'
const drawing = <Canvas><Canvas.Rect className="fill-red-500" /></Canvas>
const factory = 箱; const input = I; const os = P.OS; const timing = A.timing
const tree = <箱 custom={{ factory: 箱, os: P.OS }}><A.View /></箱>
const second = <箱 />; export { P }; const tail = P.select({ web: 1 })`
  const result = analyze(source)
  const web = result.targets.web!
  const journal = web.reactNativeValues!
  assert.equal(web.status, 'completed')
  assert.equal(journal.status, 'completed')
  assert.equal(journal.outputProvenance, 'completed')
  assert.equal(journal.scope, 'non-jsx-unchanged-module-runs')
  assert.equal(journal.generatedExpressions, 'not-assessed')
  assert.equal(journal.memberCompatibility, 'not-assessed')
  assert.equal(journal.dependencyRemoval, 'not-assessed')
  assert.equal(result.targets.native!.reactNativeValues, undefined)
  assert.match(web.code!, /import .*HozoAnimatedView/)
  assert.equal(
    web.code,
    lowerModule(source, 'app.tsx', 'app.tsx', createCompiler(), '', undefined, {
      unloweredReactNativeJsx: 'warn',
    })!.code,
  )
  const resolved = journal.outcomes.map((outcome) => {
    const binding = result.reactNativeUsage!.bindings[outcome.bindingIndex]!
    const reference = binding.references[outcome.referenceIndex]!
    return {
      ...outcome,
      binding,
      reference,
      text: source.slice(reference.spanStart, reference.spanEnd),
    }
  })
  const moved = resolved.filter((item) => item.disposition === 'rewritten-to-hozo')
  assert.deepEqual(moved.map((item) => item.text).sort(), ['I', 'P', 'P.OS', 'P.select'].sort())
  assert.ok(moved.some((item) => item.replacement === '@hozo/core'))
  assert.ok(moved.some((item) => item.replacement === '@hozo/rn-compat'))
  assert.deepEqual(
    resolved
      .filter((item) => item.disposition === 'remains-react-native')
      .map((item) => item.text)
      .sort(),
    ['A.timing', '箱'].sort(),
  )
  const unknown = resolved.filter((item) => item.disposition === 'not-assessed')
  assert.deepEqual(unknown.map((item) => item.text).sort(), ['P.OS', '箱'].sort())
  assert.ok(unknown.every((item) => item.emittedSpan === undefined))
  for (const item of resolved.filter((item) => item.emittedSpan)) {
    assert.equal(item.sourceEvidence, 'unchanged-module-run')
    assert.equal(web.code!.slice(item.emittedSpan!.spanStart, item.emittedSpan!.spanEnd), item.text)
  }
})

test('types, namespace/default/dynamic reads and policy do not imply member compatibility', () => {
  const source = `import RN from 'react-native'; import * as N from 'react-native';
import { Platform as P, type ViewStyle } from 'react-native';
const a = RN.Platform.OS; const b = N.View; const c = P[key]; const d = P['a|b'];
type A = typeof P; let style: ViewStyle; function shadow(P) { return P.OS }`
  const result = analyze(source, 'app.ts')
  const journal = result.targets.web!.reactNativeValues!
  assert.equal(journal.status, 'completed')
  assert.equal(journal.typeReferencesExcluded, 2)
  assert.equal(journal.outcomes.length, 4)
  assert.equal(
    journal.outcomes.filter((item) => item.disposition === 'remains-react-native').length,
    2,
  )
  assert.equal(
    journal.outcomes.filter((item) => item.disposition === 'rewritten-to-hozo').length,
    2,
  )
  assert.ok(journal.outcomes.every((item) => item.sourceEvidence === 'unchanged-module-run'))
  const allowed = analyze(source, 'app.ts', 'allow').targets.web!.reactNativeValues!
  assert.equal(allowed.status, 'not-assessed')
  assert.equal(allowed.outputProvenance, 'completed')
  assert.ok(allowed.outcomes.every((item) => item.disposition === 'not-assessed'))
  assert.ok(allowed.outcomes.every((item) => item.sourceEvidence === 'unchanged-module-run'))
})

test('prop/handler/generated-child references are unknown even if emitted text looks identical', () => {
  const source = `import { View, Platform } from 'react-native'; const x = <View onPress={() => Platform.select({ web: View })} custom={Platform.OS}>{Platform.OS}</View>`
  const result = analyze(source)
  const journal = result.targets.web!.reactNativeValues!
  assert.equal(journal.status, 'completed')
  assert.equal(journal.outcomes.length, 4)
  assert.ok(journal.outcomes.every((item) => item.disposition === 'not-assessed'))
  assert.ok(journal.outcomes.every((item) => item.sourceEvidence === 'not-assessed'))
  assert.ok(journal.outcomes.every((item) => item.emittedSpan === undefined))
  assert.match(result.targets.web!.code!, /Platform\.OS/)
})

test('unrecorded edits invalidate positive provenance; generated copies never gain authored identity', () => {
  const source = `import { Platform } from 'react-native'; const os = Platform.OS`
  const result = analyze(source, 'app.ts')
  const usage = { ...analyzeReactNativeUsage(source, 'app.ts'), status: 'completed' as const }
  const journal = reactNativeValueJournal(source, usage)
  assert.equal(
    journal.finish(`${source}\n// unrecorded`, result.targets.web!.reactNativeImports!, true)
      .status,
    'partial',
  )
  assert.equal(journal.analysis.outputProvenance, 'unmapped')
  assert.equal(journal.analysis.outcomes[0]!.disposition, 'not-assessed')
  const map = new SourceProvenance('😀abc Platform.OS tail')
  map.apply('😀abc Platform.OS tail', [
    { spanStart: 2, spanEnd: 5, replacement: 'Platform.OS prefix' },
  ])
  const output = '😀Platform.OS prefix Platform.OS tail'
  assert.deepEqual(map.emitted(output, 6, 17), { spanStart: 21, spanEnd: 32 })
  assert.equal(map.emitted(output, 2, 5), undefined)
  assert.equal(map.emitted(`${output}!`, 6, 17), undefined)
  map.apply(output, [{ spanStart: 21, spanEnd: 32, replacement: 'Platform.OS' }])
  assert.deepEqual(map.emitted(output, 6, 17), { spanStart: 21, spanEnd: 32 })
  map.apply(output, [{ spanStart: 21, spanEnd: 32, replacement: 'Platform.OS + 0' }])
  assert.equal(
    map.emitted(output.replace(' prefix Platform.OS ', ' prefix Platform.OS + 0 '), 6, 17),
    undefined,
  )
})

test('transformed authoring-import removal is recorded before mapping a later RN reference', () => {
  const source = `import { View } from '@hozo/core'; import { Platform } from 'react-native'; const x = <View />; const os = Platform.OS`
  const result = analyze(source, 'app.mdx')
  const web = result.targets.web!
  assert.equal(web.status, 'completed')
  assert.doesNotMatch(web.code!, /from ['"]@hozo\/core/)
  assert.equal(web.reactNativeValues!.outputProvenance, 'completed')
  assert.equal(web.reactNativeValues!.outcomes[0]!.disposition, 'rewritten-to-hozo')
})

test('final pipeline failure keeps individual evidence but never a completed value verdict', () => {
  const source = `import { Platform } from 'react-native'; const os = Platform.OS; const x = 1`
  const real = createCompiler()
  let calls = 0
  const result = analyzeModule(source, {
    compiler: {
      ...real,
      compileNativeModule(...args) {
        if (++calls > 1) throw new Error('controlled residue failure')
        return real.compileNativeModule(...args)
      },
    },
    file: 'app.ts',
    root: '',
    targets: ['web'],
  })
  assert.equal(result.targets.web!.status, 'failed')
  assert.equal(result.targets.web!.reactNativeValues!.status, 'failed')
  assert.equal(result.targets.web!.reactNativeValues!.outcomes[0]!.disposition, 'rewritten-to-hozo')
})
