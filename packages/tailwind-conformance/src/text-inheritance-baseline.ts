// Real compiler/Metro code and React, simulated RN hosts. No timings from
// this instrumented development renderer are presented as device performance.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler, summarizeTextForwarding } from '@hozo/compiler'
import { transformHozoSource } from '@hozo/metro'
import { transformSync } from 'esbuild'
import './native-render.ts'
import {
  OPEN_WORKLOAD_MODULES,
  TEXT_FIXTURES,
  TEXT_PROPERTIES,
  WORKLOAD_EXPECTED,
  WORKLOAD_SOURCE,
} from './text-inheritance-fixtures.ts'
import { resetTextCounts, textCounts } from './text-inheritance-host.ts'

// Only this test/standalone process gets the counting host; the shared stub
// and shipped components remain unchanged. Its Text identity is shared by
// the primitive's direct-child check and by generated imports.
registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'react-native'
      ? { url: new URL('./text-inheritance-host.ts', import.meta.url).href, shortCircuit: true }
      : next(specifier, context)
  },
})

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const stub = require('./react-native-stub.js')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export type TextInheritanceMode = 'baseline' | 'reference' | 'reference-intent'
type Experiment = (code: string) => {
  code: string
  decisions: unknown[]
  plainText?: boolean
  boundary?: unknown
}
const reference = () =>
  require('./text-inheritance-reference.ts') as typeof import('./text-inheritance-reference.ts')
const referenceCounts = (mode: TextInheritanceMode) =>
  mode !== 'baseline' ? reference().referenceExecutions() : {}
const executionDelta = (before: Record<string, number>, after: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(after).map(([name, value]) => [name, value - (before[name] ?? 0)]),
  )

export function classifyObservation(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
) {
  const missing = Object.entries(expected)
    .filter(([property, value]) => !Object.is(actual[property], value))
    .map(([property, value]) => ({ property, expected: value, actual: actual[property] ?? null }))
  return { status: missing.length === 0 ? 'supported' : 'gap', mismatches: missing }
}

export function compileTextGraph(
  modules: Record<string, string>,
  summaries: readonly string[] = [],
  mode: TextInheritanceMode = 'baseline',
  experiment?: Experiment,
) {
  const compiler = createCompiler()
  compiler.setTextForwarding(
    summaries.map((name) => ({
      module: `fixture:${name}`,
      components: summarizeTextForwarding(modules[name]).components,
    })),
  )
  const records: Record<string, unknown> = {}
  const cache = new Map()
  const loading = new Set()
  function load(name: string) {
    if (cache.has(name)) return cache.get(name)
    assert.ok(!loading.has(name), `cyclic fixture module ${name}`)
    assert.ok(Object.hasOwn(modules, name), `missing fixture module ${name}`)
    loading.add(name)
    const diagnostics: unknown[] = []
    const imports = new Set<string>()
    // Capture the compiler result used by Metro, not a separately guessed
    // parse. The second pass below only strips TS/JSX and measures its bytes.
    const transformed = transformHozoSource(modules[name], `${name}.tsx`, undefined, {
      ...compiler,
      compileNativeModule(...args) {
        const result = compiler.compileNativeModule(
          args[0],
          args[1],
          args[2],
          mode === 'reference-intent' ? { textReference: true } : args[3],
        )
        for (const component of result.components) {
          diagnostics.push(...component.diagnostics)
          for (const entry of component.runtimeImports) imports.add(entry)
        }
        return result
      },
    })
    const lowered = transformed ?? modules[name]
    const experimental = experiment?.(lowered)
    const code = experimental?.code ?? lowered
    const js = transformSync(code, { loader: 'tsx', jsx: 'automatic', format: 'cjs' }).code
    const minified = transformSync(js, { loader: 'js', minify: true, format: 'cjs' }).code
    records[name] = {
      source: modules[name],
      transformed: code,
      transformedByHozo: transformed !== null,
      transformedBytes: Buffer.byteLength(code),
      minifiedModuleBytes: Buffer.byteLength(minified),
      runtimeImports: [...imports].sort(),
      diagnostics,
      ...(experimental
        ? {
            experiment: {
              lowered,
              decisions: experimental.decisions,
              ...(experimental.plainText !== undefined
                ? { plainText: experimental.plainText, boundary: experimental.boundary }
                : {}),
            },
          }
        : {}),
    }
    const module = { exports: {} }
    new Function('require', 'module', 'exports', js)(
      (specifier: string) => {
        if (experiment && specifier === 'fixture:paint-masked-text')
          return { PaintMaskedText: reference().PaintMaskedText }
        if (specifier.startsWith('fixture:')) return load(specifier.slice('fixture:'.length))
        const imported = require(specifier)
        if (mode !== 'baseline' && specifier === 'react-native') {
          const contextual = reference().referenceNativeImports(imported)
          return experimental?.plainText ? { ...contextual, Text: imported.Text } : contextual
        }
        if (
          mode !== 'baseline' &&
          /^@hozo\/(core|primitives)\/generated\/pressable$/.test(specifier)
        ) {
          return { ...imported, HozoPressable: reference().ReferencePressable }
        }
        if (
          mode === 'reference-intent' &&
          /^@hozo\/(core|primitives)\/generated\/text-size$/.test(specifier)
        )
          return require('./text-inheritance-relative-reference.ts').relativeReferenceImports
        return imported
      },
      module,
      module.exports,
    )
    cache.set(name, module.exports)
    loading.delete(name)
    return module.exports
  }
  return { exports: load('scene'), modules: records }
}

function delta(before: ReturnType<typeof textCounts>, after: ReturnType<typeof textCounts>) {
  return Object.fromEntries(
    Object.entries(after).map(([id, counts]) => [
      id,
      Object.fromEntries(
        Object.entries(counts).map(([key, count]) => [key, count - (before[id]?.[key] ?? 0)]),
      ),
    ]),
  )
}

function observedLabel(tree: ReturnType<typeof renderer.create>) {
  const matches = tree.root.findAll(
    (node: { type: string; props: { testID?: string } }) =>
      node.type === 'Text' && node.props.testID === 'label',
  )
  assert.equal(matches.length, 1, 'exactly one observed host label must exist')
  const style = stub.StyleSheet.flatten(matches[0].props.style)
  return Object.fromEntries(
    Object.values(TEXT_PROPERTIES).map((property) => [property, style[property] ?? null]),
  )
}

export function measureTextFixtures(
  mode: TextInheritanceMode = 'baseline',
  experiment?: Experiment,
) {
  return TEXT_FIXTURES.map((fixture) => {
    const compiled = compileTextGraph(
      fixture.modules,
      'summarize' in fixture ? fixture.summarize : [],
      mode,
      experiment,
    )
    resetTextCounts()
    if (mode !== 'baseline') reference().resetReferenceExecutions()
    let tree: ReturnType<typeof renderer.create>
    let commits = 0
    const scene = (props: object) =>
      React.createElement(
        React.Profiler,
        {
          id: fixture.id,
          onRender: () => {
            commits += 1
          },
        },
        React.createElement(compiled.exports.Scene, props),
      )
    try {
      const stages = fixture.stages.map((stage, index) => {
        const before = textCounts()
        const previousReference = referenceCounts(mode)
        commits = 0
        renderer.act(() => {
          if (index === 0) tree = renderer.create(scene(stage.props))
          else tree.update(scene(stage.props))
        })
        const actual = observedLabel(tree)
        return {
          name: stage.name,
          expected: stage.expected,
          actual,
          ...classifyObservation(stage.expected, actual),
          textExecutions: delta(before, textCounts()),
          referenceExecutions: executionDelta(previousReference, referenceCounts(mode)),
          sceneCommits: commits,
        }
      })
      renderer.act(() => tree.unmount())
      tree = undefined
      return {
        id: fixture.id,
        required: fixture.required,
        stages,
        lifetime: textCounts(),
        modules: compiled.modules,
      }
    } finally {
      // Failed assertions must still clean up before the next fixture.
      if (tree) renderer.act(() => tree.unmount())
    }
  })
}

export function measureTextWorkload(
  rows: number,
  mode: TextInheritanceMode = 'baseline',
  shape: 'closed' | 'opaque' = 'closed',
  experiment?: Experiment,
) {
  assert.ok(Number.isInteger(rows) && rows > 0 && rows <= 1000, 'rows must be 1..1000')
  const compiled = compileTextGraph(
    shape === 'closed' ? { scene: WORKLOAD_SOURCE } : OPEN_WORKLOAD_MODULES,
    [],
    mode,
    experiment,
  )
  resetTextCounts()
  if (mode !== 'baseline') reference().resetReferenceExecutions()
  const commits: Record<string, number> = {}
  const cells = () =>
    Array.from({ length: rows }, (_, index) =>
      React.createElement(
        React.Profiler,
        {
          key: index,
          id: String(index),
          onRender: () => {
            commits[index] = (commits[index] ?? 0) + 1
          },
        },
        React.createElement(compiled.exports.Cell, { index }),
      ),
    )
  function Parent({ children }: { children: unknown; tick: number }) {
    return children
  }
  const stableChildren = cells()
  const scene = (children: unknown, tick: number) => React.createElement(Parent, { tick }, children)
  let tree: ReturnType<typeof renderer.create>
  const operations = []
  function operation(name: string, work: () => void) {
    const before = textCounts()
    const previousReference = referenceCounts(mode)
    for (const id of Object.keys(commits)) delete commits[id]
    renderer.act(work)
    operations.push({
      name,
      textExecutions: delta(before, textCounts()),
      referenceExecutions: executionDelta(previousReference, referenceCounts(mode)),
      cellCommits: { ...commits },
    })
  }
  try {
    operation('mount', () => {
      tree = renderer.create(scene(stableChildren, 0))
    })
    const first = tree.root.findAll(
      (node: { type: string; props: { testID?: string } }) =>
        node.type === 'Text' && node.props.testID === 'label-0',
    )[0]
    const resting = stub.StyleSheet.flatten(first.props.style)
    operation('stable-children-parent-update', () => tree.update(scene(stableChildren, 1)))
    operation('reconstructed-children-parent-update', () => tree.update(scene(cells(), 2)))
    const host = () =>
      tree.root.findAll(
        (node: { type: string; props: { testID?: string } }) =>
          node.type === 'Pressable' && node.props.testID === 'button-0',
      )[0]
    operation('one-button-press', () => host().props.onPressIn({ nativeEvent: {} }))
    const pressedColor = stub.StyleSheet.flatten(first.props.style).color ?? null
    operation('one-button-release', () => host().props.onPressOut({ nativeEvent: {} }))
    const restoredColor = stub.StyleSheet.flatten(first.props.style).color ?? null
    const expected = WORKLOAD_EXPECTED
    const actual = {
      restingColor: resting.color ?? null,
      fontSize: resting.fontSize ?? null,
      pressedColor,
      restoredColor,
    }
    const retainedHost =
      first ===
      tree.root.findAll(
        (node: { type: string; props: { testID?: string } }) =>
          node.type === 'Text' && node.props.testID === 'label-0',
      )[0]
    operation('unmount', () => {
      tree.unmount()
      tree = undefined
    })
    return {
      rows,
      shape,
      semantics: { expected, actual, ...classifyObservation(expected, actual) },
      operations,
      retainedHost,
      pressedColor,
      restoredColor,
      modules: compiled.modules,
    }
  } finally {
    if (tree) renderer.act(() => tree.unmount())
  }
}

export function captureTextBaseline(rows = 8, mode: TextInheritanceMode = 'baseline') {
  assert.ok(
    ['baseline', 'reference', 'reference-intent'].includes(mode),
    'unknown text inheritance mode',
  )
  const warnings: string[] = []
  const previousWarn = console.warn
  const previousError = console.error
  console.warn = (...args) => warnings.push(args.map(String).join(' '))
  console.error = (...args) => {
    const message = args.map(String).join(' ')
    if (!message.startsWith('react-test-renderer is deprecated.')) throw new Error(message)
    warnings.push(message)
  }
  try {
    const cases = measureTextFixtures(mode)
    const workloads = [measureTextWorkload(rows, mode), measureTextWorkload(rows, mode, 'opaque')]
    const supported = cases.filter((entry) =>
      entry.stages.every((stage) => stage.status === 'supported'),
    ).length
    const regressions = cases
      .filter((entry) => entry.required && entry.stages.some((stage) => stage.status === 'gap'))
      .map((entry) => entry.id)
    const binary = path.join(root, 'packages/compiler/hozo_napi.node')
    return {
      schemaVersion: 4,
      experiment: {
        mode,
        wiring:
          mode === 'reference-intent'
            ? 'internal compiler text-reference experiment plus test-only import substitution'
            : 'test-only import substitution; generated compiler output is unchanged',
        compilerTextReference: mode === 'reference-intent',
        intentModules: [
          ...(mode === 'reference-intent' ? ['./text-inheritance-relative-reference.ts'] : []),
          // The ordinary relative fixture already uses this implementation.
          // Count it in every mode, not as an imaginary new cost only in C.
          '../../primitives/src/runtime-text-size.native.tsx',
        ].map((name) => {
          const source = readFileSync(new URL(name, import.meta.url), 'utf8')
          return {
            name,
            source,
            sha256: hash(source),
            sourceBytes: Buffer.byteLength(source),
            minifiedModuleBytes: Buffer.byteLength(
              transformSync(source, { loader: 'tsx', format: 'esm', minify: true }).code,
            ),
          }
        }),
        referenceModule:
          mode !== 'baseline'
            ? (() => {
                const source = readFileSync(
                  new URL('./text-inheritance-reference.ts', import.meta.url),
                  'utf8',
                )
                return {
                  dependencies: ['./text-inheritance-reference-core.ts'].map((name) => {
                    const source = readFileSync(new URL(name, import.meta.url), 'utf8')
                    return {
                      name,
                      source,
                      sha256: hash(source),
                      sourceBytes: Buffer.byteLength(source),
                      minifiedModuleBytes: Buffer.byteLength(
                        transformSync(source, { loader: 'ts', format: 'esm', minify: true }).code,
                      ),
                    }
                  }),
                  source,
                  sha256: hash(source),
                  sourceBytes: Buffer.byteLength(source),
                  minifiedModuleBytes: Buffer.byteLength(
                    transformSync(source, { loader: 'ts', format: 'esm', minify: true }).code,
                  ),
                }
              })()
            : null,
      },
      measurementValid: regressions.length === 0,
      compatibilityComplete:
        supported === cases.length &&
        workloads.every((entry) => entry.semantics.status === 'supported'),
      summary: { cases: cases.length, supported, gaps: cases.length - supported, regressions },
      provenance: {
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
        dirtyFiles: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
          .trim()
          .split(/\r?\n/)
          .filter(Boolean),
        fixtureHash: hash(
          JSON.stringify({
            properties: TEXT_PROPERTIES,
            fixtures: TEXT_FIXTURES,
            workload: WORKLOAD_SOURCE,
            workloadExpected: WORKLOAD_EXPECTED,
            openWorkload: OPEN_WORKLOAD_MODULES,
          }),
        ),
        driverHash: hash(
          [
            'text-inheritance-baseline.ts',
            'text-inheritance-host.ts',
            'text-inheritance-reference.ts',
            'text-inheritance-reference-core.ts',
            'text-inheritance-relative-reference.ts',
            'text-inheritance-proof-boundary.ts',
            '../../primitives/src/runtime-text-size.native.tsx',
            'native-render.ts',
            'react-native-stub.js',
          ]
            .map((name) => readFileSync(new URL(name, import.meta.url), 'utf8'))
            .join('\n'),
        ),
        binarySha256: hash(readFileSync(binary)),
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        react: require('react/package.json').version,
        renderer: require('react-test-renderer/package.json').version,
        esbuild: require('esbuild/package.json').version,
      },
      methodology: {
        mode: 'instrumented-development-react',
        compatibilityScope: 'selected regression corpus only; not general compatibility',
        scope:
          'Text wrapper executions/effect mounts, Profiler subtree commits, and applied style props on simulated RN hosts',
        excluded: [
          'native Text-to-Text inheritance',
          'layout',
          'pixels',
          'AT',
          'Hermes',
          'production timing',
          'device performance',
          'Metro bundle size',
          'context subscription counts',
        ],
        codeSize:
          'per-module transformed source and minified JS; not a bundled app or tree-shaking claim',
      },
      properties: TEXT_PROPERTIES,
      cases,
      workloads,
      warnings,
    }
  } finally {
    console.warn = previousWarn
    console.error = previousError
  }
}
