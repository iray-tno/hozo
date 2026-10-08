import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeModule } from './analysis.ts'
import { type Compiler, createCompiler } from './index.ts'
import { lowerModule } from './lower.ts'

const compiler = createCompiler()
const options = { compiler, file: 'Example.tsx', root: '', targets: ['web', 'native'] as const }

test('canonical analysis includes Canvas-only diagnostics for each requested target', () => {
  const source = `import { Canvas } from '@hozo/canvas'
export function Example() { return <Canvas.Rect className="hover:fill-red-500" /> }`
  const result = analyzeModule(source, options)
  assert.equal(result.targets.web?.semanticComponents, 0)
  assert.equal(result.targets.native?.semanticComponents, 0)
  assert.equal(result.findings.filter((item) => item.code === 'CANVAS_CLASS_NOT_LOWERED').length, 2)
  assert.deepEqual(
    result.findings.map((item) => item.stage),
    ['canvas', 'canvas'],
  )
  const expected = lowerModule(source, options.file, options.file, compiler, '')
  assert.equal(result.targets.web?.code, expected?.code)
  assert.equal(result.targets.web?.mode, 'web-module-lowering')
  assert.equal(result.targets.native?.mode, 'native-compiler-probe')
  assert.equal(result.targets.native?.code, undefined)
})

test('deduplication keeps distinct occurrences and backend verdicts', () => {
  const source = `import { Canvas } from '@hozo/canvas'
export function Example() { return <><Canvas.Rect className="hover:fill-red-500" /><Canvas.Rect className="hover:fill-red-500" /></> }`
  const result = analyzeModule(source, options)
  assert.equal(result.findings.length, 4)
  assert.equal(
    new Set(result.findings.map((item) => JSON.stringify([item.backend, item.location]))).size,
    4,
  )
})

test('authored spans are already UTF-16 offsets, including Unicode and CRLF', () => {
  const source = `import { Canvas } from '@hozo/canvas'\r\n// 😀 日本語\r\nexport const Example = () => <Canvas.Rect className="hover:fill-red-500" />`
  const result = analyzeModule(source, { ...options, targets: ['web'] })
  const finding = result.findings[0]!
  assert.equal(finding.location.status, 'authored')
  if (finding.location.status !== 'authored') throw new Error('missing authored span')
  assert.equal(finding.location.line, 3)
  assert.equal(
    finding.location.column,
    finding.location.spanStart - source.lastIndexOf('\n', finding.location.spanStart),
  )
  assert.match(
    source.slice(finding.location.spanStart, finding.location.spanEnd),
    /hover:fill-red-500/,
  )
  assert.match(finding.subject?.snippet ?? '', /hover:fill-red-500/)
  assert.equal(result.targets.native, undefined)
  assert.ok(!result.stages.some((item) => item.backend === 'native'))
})

test('rewritten-input positions are never passed off as authored locations', () => {
  const source = `import { Platform } from 'react-native'
import { Canvas } from '@hozo/canvas'
export const Example = () => <Canvas.Rect className="hover:fill-red-500" />`
  const result = analyzeModule(source, options)
  const web = result.findings.find((item) => item.backend === 'web' && item.stage === 'canvas')!
  const native = result.findings.find(
    (item) => item.backend === 'native' && item.stage === 'canvas',
  )!
  assert.equal(web.location.status, 'unmapped')
  assert.equal(web.subject, undefined)
  assert.equal(native.location.status, 'authored')
  const missing = result.findings.find((item) => item.code === 'RN_COMPAT_NOT_INSTALLED')
  // Resolution depends on the checkout, but if missing it is module-wide.
  if (missing) assert.deepEqual(missing.location, { status: 'file' })
})

test('partial Canvas findings survive a later semantic failure and other targets run', () => {
  const failing: Compiler = {
    ...compiler,
    compile: () => {
      throw new Error('semantic sentinel')
    },
  }
  const source = `import { Canvas } from '@hozo/canvas'
import { View } from '@hozo/core'
export const Example = () => <View><Canvas.Rect className="hover:fill-red-500" /></View>`
  const result = analyzeModule(source, { ...options, compiler: failing })
  assert.equal(result.targets.web?.status, 'failed')
  assert.equal(result.targets.native?.status, 'completed')
  assert.ok(
    result.findings.some(
      (item) => item.backend === 'web' && item.code === 'CANVAS_CLASS_NOT_LOWERED',
    ),
  )
  assert.ok(
    result.findings.some((item) => item.backend === 'web' && item.message === 'semantic sentinel'),
  )
})

test('Native-only analysis does not call Web lowering and parse failures are structured', () => {
  const nativeOnly: Compiler = {
    ...compiler,
    compile: () => {
      throw new Error('must not run Web')
    },
  }
  const result = analyzeModule(
    `import { View } from '@hozo/core'; export const App = () => <View />`,
    {
      ...options,
      compiler: nativeOnly,
      targets: ['native'],
    },
  )
  assert.equal(result.targets.web, undefined)
  assert.equal(result.targets.native?.status, 'completed')
  assert.equal(result.findings.length, 0)
  const invalid = analyzeModule('not valid TSX !!!', options)
  assert.equal(invalid.bindings, undefined)
  assert.ok(invalid.findings.some((item) => item.code === 'SOURCE_SYNTAX_ERROR'))
  assert.ok(invalid.stages.some((item) => item.status === 'failed'))
})

test('overlapping diagnostics dedupe without collapsing another reason at the same span', () => {
  const source = `import { View } from '@hozo/core'; export const App = () => <View className="p-2" />`
  const diagnostic = {
    code: 'TEST_DIAGNOSTIC',
    severity: 'warning',
    message: 'first reason',
    spanStart: source.indexOf('className'),
    spanEnd: source.indexOf('className') + 9,
  }
  const duplicated: Compiler = {
    ...compiler,
    compile: (code, bindings, compileOptions) =>
      compiler.compile(code, bindings, compileOptions).map((component) => ({
        ...component,
        diagnostics: [diagnostic, { ...diagnostic }, { ...diagnostic, message: 'second reason' }],
      })),
  }
  const result = analyzeModule(source, { ...options, compiler: duplicated, targets: ['web'] })
  assert.equal(result.findings.length, 2)
  assert.deepEqual(
    result.findings.map((item) => item.message),
    ['first reason', 'second reason'],
  )
})

test('invalid generated output cannot become a clean residue count', () => {
  const source = `import { View } from '@hozo/core'; export const App = () => <View />`
  const broken: Compiler = {
    ...compiler,
    compile: (code, bindings, compileOptions) =>
      compiler
        .compile(code, bindings, compileOptions)
        .map((component) => ({ ...component, jsx: '<' })),
  }
  const result = analyzeModule(source, { ...options, compiler: broken, targets: ['web'] })
  assert.equal(result.targets.web?.status, 'failed')
  assert.equal(result.targets.web?.directReactNativeJsxResidue, undefined)
  const finding = result.findings.find((item) => item.code === 'LOWERED_SYNTAX_ERROR')!
  assert.ok(finding)
  assert.equal(finding.location.status, 'unmapped')
})

test('a surviving JSX alias moved to Hozo is not direct React Native residue', () => {
  const source = `import { Pressable as Trigger } from 'react-native'
export function App({ label, ...rest }) {
  return <Trigger {...rest} accessibilityLabel={label} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]} />
}`
  const result = analyzeModule(source, { ...options, targets: ['web'] })
  assert.ok(result.bindings?.jsxBindings.includes('Trigger'))
  const emitted = compiler.compileNativeModule(result.targets.web!.code!)
  // The old audit intersected JSX names with ORIGINAL RN bindings. It counted
  // these 18 times in Bluesky even though the import had moved to @hozo/core.
  assert.ok(emitted.jsxBindings.includes('Trigger'))
  assert.ok(
    emitted.imports.some((entry) => entry.local === 'Trigger' && entry.source === '@hozo/core'),
  )
  assert.deepEqual(result.targets.web?.directReactNativeJsxResidue, [])
})
