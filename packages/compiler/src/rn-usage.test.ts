import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeModule } from './analysis.ts'
import { analyzeReactNativeUsage, createCompiler } from './index.ts'

test('RN usage resolves lexical symbols, members and component values with authored UTF-16 spans', () => {
  const source = `// 😀 日本語\r\nimport { Platform as P, View, Keyboard } from 'react-native'\r\nconst a = P.OS; const b = P['select']; const c = P[key]\r\nfunction f(P) { return P.OS }\r\nconst Component = View; const tree = <View />; // Keyboard.dismiss()`
  const result = analyzeReactNativeUsage(source, 'app.tsx')
  assert.deepEqual(result.diagnostics, [])
  const [platform, view, keyboard] = result.bindings
  assert.deepEqual(
    platform?.references.map((item) => [item.access, item.member]),
    [
      ['static-member', 'OS'],
      ['static-member', 'select'],
      ['dynamic-member', undefined],
    ],
  )
  assert.deepEqual(
    platform?.references.map((item) => source.slice(item.spanStart, item.spanEnd)),
    ['P.OS', "P['select']", 'P[key]'],
  )
  assert.equal(source.slice(platform!.spanStart, platform!.spanEnd), 'Platform as P')
  assert.deepEqual(
    view?.references.map((item) => item.access),
    ['value', 'jsx'],
  )
  assert.deepEqual(keyboard?.references, [])
})

test('RN inventory retains explicit/implicit types and forwarding edges without runtime guesses', () => {
  const source = `import type { ViewStyle } from 'react-native'
import { Platform, type TextStyle } from 'react-native'
import * as RN from 'react-native'
type T = typeof Platform; let a: ViewStyle; let b: TextStyle
const animated = RN.Animated.timing; const tree = <RN.Animated.View />
export { Platform as P }; export { Keyboard as K, type ViewProps } from 'react-native'
export * from 'react-native'; import 'react-native'`
  const usage = analyzeReactNativeUsage(source)
  assert.deepEqual(usage.diagnostics, [])
  assert.equal(usage.bindings[0]?.typeOnly, true)
  assert.equal(usage.bindings[1]?.references[0]?.kind, 'type')
  assert.equal(usage.bindings[1]?.references[1]?.access, 'reexport')
  assert.deepEqual(
    usage.bindings[3]?.references.map((item) => item.member),
    ['Animated.timing', 'Animated.View'],
  )
  assert.equal(usage.bindings[4]?.exported, 'K')
  assert.equal(usage.bindings[5]?.typeOnly, true)
  assert.equal(usage.bindings[6]?.kind, 'reexport')
  assert.equal(usage.bindings[7]?.kind, 'side-effect')
})

test('block, catch and function scopes do not inflate imported RN references', () => {
  const source = `import { Platform } from 'react-native'
function one(Platform) { return Platform.OS }
{ const Platform = other; Platform.select({}) }
try {} catch (Platform) { Platform.OS }
const note = 'Platform.OS'; const obj = { Platform: other }
const actual = Platform?.OS`
  const usage = analyzeReactNativeUsage(source, 'app.ts')
  assert.deepEqual(usage.diagnostics, [])
  assert.equal(usage.bindings[0]?.references.length, 1)
  assert.equal(usage.bindings[0]?.references[0]?.member, 'OS')
})

test('an empty type import is not runtime side-effect evidence', () => {
  const usage = analyzeReactNativeUsage(
    `import type {} from 'react-native'; import {} from 'react-native'`,
    'app.ts',
  )
  assert.deepEqual(usage.diagnostics, [])
  assert.equal(usage.bindings.length, 1)
  assert.equal(usage.bindings[0]?.kind, 'side-effect')
  assert.equal(usage.bindings[0]?.typeOnly, false)
})

test('canonical source inventory is not a Web or Native rewrite verdict', () => {
  const source = `import { Platform, Animated } from 'react-native'
export const a = Platform.OS; export const b = Animated.timing`
  const analysis = analyzeModule(source, {
    compiler: createCompiler(),
    file: 'app.ts',
    root: '',
    targets: ['web'],
  })
  assert.equal(analysis.reactNativeUsage?.status, 'completed')
  assert.deepEqual(
    analysis.reactNativeUsage?.bindings.map((item) => item.references[0]?.member),
    ['OS', 'timing'],
  )
  assert.match(analysis.targets.web?.code ?? '', /@hozo\/rn-compat/)
  assert.equal(analysis.targets.native, undefined)
  assert.ok(
    analysis.stages.some((stage) => stage.backend === 'source' && stage.stage === 'rn-usage'),
  )
})

test('parse/binding errors are not successful empty usage and filenames select the grammar', () => {
  assert.deepEqual(analyzeReactNativeUsage('const id = <T>(x: T) => x', 'app.ts').diagnostics, [])
  const invalid = analyzeReactNativeUsage(
    'import { Platform } from "react-native"; const a = <',
    'app.tsx',
  )
  assert.ok(invalid.diagnostics.length > 0)
  assert.deepEqual(invalid.bindings, [])
  const duplicate = analyzeReactNativeUsage(
    'import { Platform } from "react-native"; const Platform = 1',
    'app.ts',
  )
  assert.ok(duplicate.diagnostics.length > 0)
  assert.deepEqual(duplicate.bindings, [])
})
