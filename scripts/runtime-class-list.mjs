// A headless rendering benchmark, not a resolver loop or device/FPS claim.
// Run this SAME driver against each source checkout, with one dependency
// installation, so compiler/host changes are not mixed with React upgrades.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

export const BEFORE = 'cc1914bf49aaddd642d850bed77cb503e3e9966d'
export const AFTER = '6333a72ba5720fc3b25f4eeab0bbd66b5bf131b4'
const driverRoot = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(path.join(driverRoot, 'packages/tailwind-conformance/package.json'))
const React = require('react')
const renderer = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

export function summarize(values) {
  assert.ok(values.length > 0 && values.every((value) => Number.isFinite(value) && value >= 0))
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1]
  return {
    medianMs: percentile(0.5),
    p90Ms: percentile(0.9),
    minMs: sorted[0],
    maxMs: sorted.at(-1),
    samplesMs: values,
  }
}

export function options(args) {
  const result = {
    root: driverRoot,
    rows: [32, 256, 1024],
    samples: 9,
    warmups: 2,
    output: undefined,
  }
  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = [args[i], args[i + 1]]
    assert.ok(value, `missing value for ${key}`)
    if (key === '--root') result.root = path.resolve(value)
    else if (key === '--output') result.output = path.resolve(value)
    else if (key === '--rows') result.rows = value.split(',').map(Number)
    else if (key === '--samples') result.samples = Number(value)
    else if (key === '--warmups') result.warmups = Number(value)
    else throw new Error(`unknown option ${key}`)
  }
  assert.ok(
    result.rows.length > 0 && result.rows.every((n) => Number.isInteger(n) && n > 0 && n <= 10000),
  )
  assert.ok(Number.isInteger(result.samples) && result.samples > 0 && result.samples <= 100)
  assert.ok(Number.isInteger(result.warmups) && result.warmups >= 0 && result.warmups <= 10)
  return result
}

// Follow that checkout's export map rather than borrowing today's ABI.
function sourceEntry(root, specifier, native = false) {
  const [, owner, suffix = ''] = /^@hozo\/([^/]+)(.*)$/.exec(specifier) ?? []
  assert.ok(owner, `not a Hozo entry: ${specifier}`)
  const directory = path.join(root, 'packages', owner)
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
  const entry = manifest.exports[suffix ? `.${suffix}` : '.']
  const selected = native && entry?.['react-native'] ? entry['react-native'] : entry
  const published = typeof selected === 'string' ? selected : selected?.default
  assert.ok(published?.startsWith('./dist/'), `no source entry for ${specifier}`)
  const base = path.join(directory, published.replace('./dist/', 'src/').replace(/\.js$/, ''))
  const file = [`${base}.ts`, `${base}.tsx`].find(existsSync)
  assert.ok(file, `missing source for ${specifier}: ${base}`)
  return file
}

async function prepare(root) {
  // Raw historical compiler/Metro source, but fixed driver dependencies.
  // Each checkout runs in its own process: addon and module caches cannot
  // accidentally reuse another revision's compiler or class resolver.
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('@hozo/')) {
        return { url: pathToFileURL(sourceEntry(root, specifier)).href, shortCircuit: true }
      }
      if (
        !specifier.startsWith('.') &&
        !path.isAbsolute(specifier) &&
        context.parentURL?.startsWith(pathToFileURL(root + path.sep).href)
      ) {
        const relative = path.relative(root, fileURLToPath(context.parentURL))
        return next(specifier, {
          ...context,
          parentURL: pathToFileURL(path.join(driverRoot, relative)).href,
        })
      }
      return next(specifier, context)
    },
  })
  let compiler
  let transformHozoSource
  const binary = path.join(root, 'packages/compiler/hozo_napi.node')
  assert.ok(existsSync(binary), `build this checkout's addon first: ${binary}`)
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: uncached standalone historical driver, not a Turbo task
  const previousBinding = process.env.HOZO_NATIVE_BINDING
  process.env.HOZO_NATIVE_BINDING = binary
  try {
    compiler = await import(pathToFileURL(path.join(root, 'packages/compiler/src/index.ts')).href)
    ;({ transformHozoSource } = await import(
      pathToFileURL(path.join(root, 'packages/metro/src/transform.ts')).href
    ))
  } finally {
    hooks.deregister()
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: restore the caller's override after loading the pinned binary
    if (previousBinding === undefined) delete process.env.HOZO_NATIVE_BINDING
    else process.env.HOZO_NATIVE_BINDING = previousBinding
  }
  const source = `import { Pressable, Text } from '@hozo/core'
export function Row({ look, index, tick }) {
  return <Pressable className={look} accessibilityRole="button" onPress={() => {}} testID={'row-' + index}>
    <Text>{'Row ' + index + ':' + tick}</Text>
  </Pressable>
}`
  const cache = compiler.openCandidateCache()
  cache.scanFile('looks.ts', 'const look = "p-4 bg-blue-500 active:opacity-50"', 1)
  const candidates = cache.renderNativeModule()
  const warnings = []
  const originalWarn = console.warn
  let transformed
  try {
    console.warn = (message) => warnings.push(String(message))
    transformed = transformHozoSource(source, path.join(root, 'Benchmark.tsx'), root)
  } finally {
    console.warn = originalWarn
  }
  assert.ok(transformed, 'Metro declined the benchmark source')
  const bundled = await build({
    stdin: { contents: transformed, resolveDir: root, sourcefile: 'Benchmark.tsx', loader: 'tsx' },
    bundle: true,
    logLevel: 'silent',
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    jsx: 'automatic',
    plugins: [
      {
        name: 'headless-native-benchmark',
        setup(builder) {
          builder.onResolve({ filter: /candidates\.native\.js$/ }, () => ({
            path: 'candidates',
            namespace: 'benchmark',
          }))
          builder.onResolve({ filter: /^react-native$/ }, () => ({
            path: 'host',
            namespace: 'benchmark',
          }))
          builder.onResolve({ filter: /^@hozo\// }, ({ path: specifier }) => ({
            path: sourceEntry(root, specifier, true),
          }))
          builder.onLoad({ filter: /.*/, namespace: 'benchmark' }, ({ path: name }) => ({
            contents:
              name === 'candidates'
                ? candidates
                : `export * from ${JSON.stringify(path.join(driverRoot, 'packages/tailwind-conformance/src/react-native-stub.js'))};
export { NativePressable as Pressable } from 'benchmark-host';`,
            loader: 'ts',
            resolveDir: root,
          }))
        },
      },
    ],
  })
  let renders = 0
  // The shared stub intentionally preserves callback shape for assertions.
  // Here the host must EVALUATE it, as RN does, or resolution is not timed.
  function NativePressable({ children, style, ...props }) {
    const [pressed, setPressed] = React.useState(false)
    renders += 1
    const state = { pressed }
    return React.createElement(
      'NativePressable',
      {
        ...props,
        onPressIn: () => {
          setPressed(true)
          props.onPressIn?.()
        },
        onPressOut: () => {
          setPressed(false)
          props.onPressOut?.()
        },
        style: typeof style === 'function' ? style(state) : style,
      },
      typeof children === 'function' ? children(state) : children,
    )
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', bundled.outputFiles[0].text)(
    (specifier) => (specifier === 'benchmark-host' ? { NativePressable } : require(specifier)),
    module.exports,
    module,
  )
  const exports = module.exports
  assert.equal(typeof exports.Row, 'function')
  return {
    Row: exports.Row,
    source,
    transformed,
    candidates,
    warnings,
    buildWarnings: bundled.warnings.map(({ text }) => text),
    binarySha256: createHash('sha256').update(readFileSync(binary)).digest('hex'),
    resetRenders: () => {
      renders = 0
    },
    renderCount: () => renders,
  }
}

export async function measure(config) {
  const prepared = await prepare(config.root)
  const results = []
  const runtimeWarnings = []
  const originalWarn = console.warn
  const originalError = console.error
  try {
    // Keep every diagnostic in evidence; warn-once startup and renderer's
    // deprecation message are not console-I/O costs inside the timer.
    console.warn = (...messages) => runtimeWarnings.push(messages.map(String).join(' '))
    console.error = (...messages) => {
      const message = messages.map(String).join(' ')
      assert.ok(
        message.startsWith('react-test-renderer is deprecated.'),
        `unexpected render error: ${message}`,
      )
      runtimeWarnings.push(message)
    }
    for (const scenario of ['plain', 'state-classes']) {
      const look = `p-4 bg-blue-500${scenario === 'plain' ? '' : ' active:opacity-50'}`
      for (const rows of config.rows) {
        const mountTimes = []
        const updateTimes = []
        const pressTimes = []
        let semantic
        const scene = (tick) =>
          React.createElement(
            React.Fragment,
            null,
            ...Array.from({ length: rows }, (_, index) =>
              React.createElement(prepared.Row, { key: index, index, tick, look }),
            ),
          )
        for (let trial = -config.warmups; trial < config.samples; trial += 1) {
          let root
          try {
            prepared.resetRenders()
            let start = performance.now()
            React.act(() => {
              root = renderer.create(scene(0))
            })
            const mountMs = performance.now() - start
            assert.equal(prepared.renderCount(), rows, 'the requested rows were not mounted')
            prepared.resetRenders()
            start = performance.now()
            React.act(() => root.update(scene(1)))
            const updateMs = performance.now() - start
            assert.equal(prepared.renderCount(), rows, 'parent update did not render every row')
            const hosts = root.root.findAllByType('NativePressable')
            assert.equal(hosts.length, rows)
            const flatten = (value) =>
              Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value || {}
            const resting = flatten(hosts[0].props.style)
            assert.equal(resting.paddingTop, 16)
            assert.ok(resting.backgroundColor)
            prepared.resetRenders()
            start = performance.now()
            React.act(() => hosts[0].props.onPressIn())
            const pressMs = performance.now() - start
            assert.equal(prepared.renderCount(), 1, 'one press must not re-render idle siblings')
            const activeOpacity = flatten(hosts[0].props.style).opacity
            semantic = {
              restingOpacity: resting.opacity ?? null,
              pressedOpacity: activeOpacity ?? null,
              stateSupported: scenario === 'state-classes' && activeOpacity === 0.5,
              siblingOpacity: rows > 1 ? (flatten(hosts[1].props.style).opacity ?? null) : null,
            }
            if (scenario === 'plain') assert.equal(activeOpacity, undefined)
            if (scenario === 'state-classes' && /\bconst states\s*=/.test(prepared.candidates))
              assert.equal(
                activeOpacity,
                0.5,
                'state-capable candidate output did not reach the real rendered host',
              )
            if (trial >= 0) {
              mountTimes.push(mountMs)
              updateTimes.push(updateMs)
              pressTimes.push(pressMs)
            }
          } finally {
            if (root) React.act(() => root.unmount())
          }
        }
        results.push({
          scenario,
          rows,
          mount: summarize(mountTimes),
          parentUpdate: summarize(updateTimes),
          oneRowPress: summarize(pressTimes),
          semantic,
        })
      }
    }
  } finally {
    console.warn = originalWarn
    console.error = originalError
  }
  return {
    schemaVersion: 1,
    binarySha256: prepared.binarySha256,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: config.root,
      encoding: 'utf8',
    }).trim(),
    driverCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: driverRoot,
      encoding: 'utf8',
    }).trim(),
    environment: {
      node: process.version,
      react: require('react/package.json').version,
      renderer: require('react-test-renderer/package.json').version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.availableParallelism(),
    },
    methodology: {
      samples: config.samples,
      warmups: config.warmups,
      rows: config.rows,
      dependencies: 'shared driver installation',
      renderer:
        'development react-test-renderer with simulated RN hosts; no device, layout, GPU, bridge or FPS evidence',
      cache:
        'shared generated candidate resolver warmed by untimed trials; compilation and bundling excluded',
      timing:
        'scene construction and act synchronous render/commit/effects included; unmount, assertions and host lookup excluded',
      warningPolicy: 'captured, retained; not discarded or timed as console I/O',
      stateBaseline:
        'before #888 state classes are refused; state-classes timings are NOT equivalent styling workloads',
    },
    warnings: {
      compile: prepared.warnings,
      build: prepared.buildWarnings,
      runtime: [...new Set(runtimeWarnings)],
    },
    fixture: {
      source: prepared.source,
      transformed: prepared.transformed,
      candidates: prepared.candidates,
    },
    results,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = options(process.argv.slice(2))
  const result = await measure(config)
  const json = `${JSON.stringify(result, null, 2)}\n`
  if (config.output) {
    mkdirSync(path.dirname(config.output), { recursive: true })
    writeFileSync(config.output, json)
  } else process.stdout.write(json)
}
