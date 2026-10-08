import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeModule } from './analysis.ts'
import { reactNativeImportJournal } from './analysis-rn.ts'
import { analyzeReactNativeUsage, createCompiler, reactNativeImports } from './index.ts'
import { lowerModule, rehomeReactNativeRuntimeImports } from './lower.ts'

test('the real import rewrite ignores comments/templates, keeps trivia and parses aliases and mixed imports', () => {
  const source = `// 😀 日本語\r\n// import { Platform } from 'react-native'
const note = "import { Keyboard } from 'react-native'"
const template = \`import { Dimensions } from 'react-native'\`
import RN, { /* why this alias */ Platform as プラットフォーム, type ViewStyle, Animated } from 'react-native'
import type { Keyboard } from 'react-native'
import * as Native from 'react-native'
const id = <T>(x: T) => x`
  const result = rehomeReactNativeRuntimeImports(source, 'app.ts')
  assert.match(result, /import \{ Platform as プラットフォーム \} from '@hozo\/rn-compat'/)
  assert.match(result, /import RN, \{ type ViewStyle, Animated \} from 'react-native'/)
  assert.match(result, /\/\* why this alias \*\//)
  assert.ok(result.includes(`// import { Platform } from 'react-native'`))
  assert.ok(result.includes(`"import { Keyboard } from 'react-native'"`))
  assert.ok(result.includes("`import { Dimensions } from 'react-native'`"))
  assert.match(result, /import type \{ Keyboard \} from 'react-native'/)
  assert.match(result, /import \* as Native from 'react-native'/)
  assert.deepEqual(reactNativeImports(result, 'app.ts').diagnostics, [])
  assert.equal(rehomeReactNativeRuntimeImports(result, 'app.ts'), result)
})

test('escaped module strings are decoded and import attributes are deliberately retained', () => {
  const escaped = String.raw`import { Platform as P } from 'react\u002dnative'; P.OS`
  assert.match(rehomeReactNativeRuntimeImports(escaped), /@hozo\/rn-compat/)
  const escapedName = String.raw`import { Pl\u0061tform as P } from 'react-native'; P.OS`
  assert.match(rehomeReactNativeRuntimeImports(escapedName), /@hozo\/rn-compat/)
  const attributed = `import { Platform } from 'react-native' with { type: 'json' }`
  assert.equal(rehomeReactNativeRuntimeImports(attributed), attributed)
  assert.throws(
    () => rehomeReactNativeRuntimeImports(`import { Platform } from 'react-native'; const x = <`),
    /RN_IMPORT_PARSE_FAILED/,
  )
})

test('canonical outcomes join authored bindings to actual import edits, not JSX consumption', () => {
  const source = `// 😀\r\nimport RN, { Platform as P, Pressable as Tap, TextInput, Animated, View, type ViewStyle } from 'react-native'
import * as Native from 'react-native'
import type { TextStyle } from 'react-native'
const os = P.OS; const input = <TextInput />; const tree = <View><Tap /></View>
const factory = View; const dynamic = P[key]; const animate = Animated.timing; const unknown = Native.Platform.OS
export { Keyboard } from 'react-native'`
  const analysis = analyzeModule(source, {
    compiler: createCompiler(),
    file: 'app.tsx',
    root: '',
    targets: ['web', 'native'],
  })
  assert.equal(analysis.targets.web?.status, 'completed')
  const boundary = analysis.targets.web!.reactNativeImports!
  assert.equal(boundary.status, 'completed')
  assert.equal(boundary.unmappedDecisions, 0)
  const bindings = analysis.reactNativeUsage!.bindings
  const outcomes = Object.fromEntries(
    boundary.outcomes.map((item) => [bindings[item.bindingIndex]!.local ?? 'reexport', item]),
  )
  assert.equal(outcomes.P?.replacement, '@hozo/rn-compat')
  assert.equal(outcomes.Tap?.replacement, '@hozo/core')
  assert.equal(outcomes.TextInput?.replacement, '@hozo/core')
  assert.equal(outcomes.Animated?.disposition, 'retained-react-native')
  assert.equal(outcomes.Native?.disposition, 'retained-react-native')
  assert.equal(outcomes.RN?.disposition, 'retained-react-native')
  assert.equal(outcomes.ViewStyle?.disposition, 'type-only')
  assert.equal(outcomes.TextStyle?.disposition, 'type-only')
  assert.equal(outcomes.reexport?.disposition, 'not-assessed')
  // <View> lowering does not rewrite its import. Nor does a moved Platform
  // import certify every dynamic member or a successful production build.
  assert.equal(outcomes.View?.disposition, 'retained-react-native')
  assert.equal(boundary.semanticReferences, 'not-assessed')
  assert.equal(boundary.memberCompatibility, 'not-assessed')
  assert.equal(boundary.dependencyRemoval, 'not-assessed')
  assert.equal(analysis.targets.native?.reactNativeImports, undefined)
  for (const outcome of boundary.outcomes) {
    const binding = bindings[outcome.bindingIndex]!
    assert.ok(
      source.slice(binding.spanStart, binding.spanEnd).includes(binding.local ?? binding.imported),
    )
  }
})

test('policy allow, syntax errors and unmatched provenance cannot become successful boundary claims', () => {
  const source = `import { Platform } from 'react-native'; const x = Platform.OS`
  const options = {
    compiler: createCompiler(),
    file: 'app.ts',
    root: '',
    targets: ['web'] as const,
  }
  const allowed = analyzeModule(source, { ...options, unloweredReactNativeJsx: 'allow' })
  assert.equal(allowed.targets.web?.reactNativeImports?.status, 'not-assessed')
  assert.equal(allowed.targets.web?.reactNativeImports?.outcomes[0]?.disposition, 'not-assessed')
  const invalid = analyzeModule(`${source}; const x = <`, { ...options, file: 'app.tsx' })
  assert.equal(invalid.targets.web?.status, 'failed')
  assert.equal(invalid.targets.web?.reactNativeImports, undefined)
  const journal = reactNativeImportJournal(
    source,
    { ...analyzeReactNativeUsage(source), status: 'completed' },
    true,
  )
  journal.record('different', [
    {
      imported: 'Platform',
      local: 'Platform',
      typeOnly: false,
      spanStart: 0,
      spanEnd: 4,
      disposition: 'rewritten-to-hozo',
      replacement: '@hozo/rn-compat',
      reason: 'test',
    },
  ])
  assert.equal(journal.finish(true).status, 'partial')
  assert.equal(journal.analysis.unmappedDecisions, 1)
  assert.equal(journal.analysis.outcomes[0]?.disposition, 'not-assessed')
})

test('plain TS uses its grammar and no-root modules still journal real import movement', () => {
  const source = `import { Platform, Pressable } from 'react-native'; const id = <T>(x: T) => x`
  const events: string[] = []
  const lowered = lowerModule(source, 'app.ts', 'app.ts', createCompiler(), '', undefined, {
    unloweredReactNativeJsx: 'warn',
    observe: (event) => {
      if (event.importDecisions) events.push(event.source!)
    },
  })
  assert.match(lowered?.code ?? '', /@hozo\/rn-compat/)
  assert.match(lowered?.code ?? '', /@hozo\/core/)
  assert.equal(events.length, 2)
  assert.equal(events[0], source)
})

test('a failed later lowering stage keeps the import journal without claiming a successful target', () => {
  const source = `import { Platform, View } from 'react-native'; const os = Platform.OS; const tree = <View />`
  const analysis = analyzeModule(source, {
    compiler: {
      ...createCompiler(),
      compile: () => {
        throw new Error('controlled semantic failure')
      },
    },
    file: 'app.tsx',
    root: '',
    targets: ['web'],
  })
  assert.equal(analysis.targets.web?.status, 'failed')
  assert.equal(analysis.targets.web?.reactNativeImports?.status, 'failed')
  assert.equal(
    analysis.targets.web?.reactNativeImports?.outcomes[0]?.disposition,
    'rewritten-to-hozo',
  )
  assert.ok(analysis.findings.some((item) => item.code === 'ANALYSIS_FAILED'))
})
