// These are wiring/identity tests with mock hosts, not native layout evidence.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'
import {
  deviceLabelSource,
  prepareTextDeviceFixture,
} from '../../../packages/tailwind-conformance/src/text-inheritance-device-source.ts'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const react = require('react')
const renderer = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const flatten = (style) =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : style && typeof style === 'object'
      ? { ...style }
      : {}

test('both Native jobs install the private proof workspace before running source-backed tests', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  for (const job of ['android', 'ios']) {
    const body = new RegExp(`^  ${job}:[\\s\\S]*?(?=^  [a-z][\\w-]*:|(?![\\s\\S]))`, 'm').exec(
      workflow,
    )?.[0]
    assert.ok(body, job)
    const install = /- run: pnpm install[^\r\n]*/.exec(body)?.[0]
    assert.ok(install, `${job} needs an explicit install`)
    assert.match(install, /--frozen-lockfile\b/)
    assert.match(install, /--filter @hozo\/example-native-showcase\.\.\./)
    assert.match(
      install,
      /--filter @hozo\/tailwind-conformance(?:\s|$)/,
      `${job}: a full workspace install can hide the generator's missing @babel/core`,
    )
    assert.ok(
      body.indexOf(install) < body.indexOf('pnpm --filter @hozo/example-native-showcase test:unit'),
    )
  }
  const app = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(
    app.dependencies['@hozo/tailwind-conformance'],
    undefined,
    'test-only source reads must not add a production conformance dependency',
  )
})

test('the device fixture is reproducible and binding decisions come from the existing proof', () => {
  execFileSync(process.execPath, ['scripts/generate-text-inheritance.mjs', '--check'], {
    cwd: root,
  })
  const prepared = prepareTextDeviceFixture()
  const generated = fileURLToPath(new URL('../src/text-inheritance-generated.tsx', import.meta.url))
  const source = readFileSync(generated, 'utf8')
  assert.equal(
    transformHozoSource(source, generated) ?? source,
    source,
    'Metro must not rebind a factory parameter',
  )
  assert.deepEqual(
    prepared.manifest.cases.map(({ route }) => route),
    ['plain-native', 'context-fallback'],
  )
  for (const entry of prepared.cases) assert.equal(entry.ordinary, entry.reference)
  const negative = prepareTextDeviceFixture(deviceLabelSource().replace('text-left ', ''))
  assert.equal(
    negative.manifest.cases[0].route,
    'context-fallback',
    'an incomplete static root must not bypass Context',
  )
  assert.notEqual(negative.manifest.cases[0].sourceSha256, prepared.manifest.cases[0].sourceSha256)
})

async function loadProbe() {
  const { build } = require('esbuild')
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/text-inheritance-probe.tsx', import.meta.url))],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react/*', 'react-native', '@hozo/*'],
    metafile: true,
    plugins: [
      {
        name: 'actual-hozo-transform',
        setup(build) {
          build.onLoad({ filter: /\.[jt]sx?$/ }, ({ path }) => {
            const source = readFileSync(path, 'utf8')
            return {
              contents: transformHozoSource(source, path) ?? source,
              loader: path.endsWith('tsx') ? 'tsx' : 'ts',
            }
          })
        },
      },
    ],
  })
  const files = Object.keys(result.metafile.inputs).map((file) => file.replaceAll('\\', '/'))
  assert.ok(files.some((file) => file.endsWith('text-inheritance-reference-core.ts')))
  assert.equal(files.length, 4, JSON.stringify(files))
  assert.ok(
    files.every(
      (file) =>
        !/text-inheritance-(host|native-projection|device-source|reference)\.ts$/.test(file),
    ),
  )
  const module = { exports: {} }
  const legacy = react.createContext(16),
    interaction = react.createContext(null)
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name)
      if (name === 'react-native')
        return {
          Text: 'NativeText',
          View: 'NativeView',
          Pressable: 'NativePressable',
          ScrollView: 'NativeScrollView',
          StyleSheet: { create: (styles) => styles, flatten },
          Platform: {
            OS: 'android',
            constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
          },
        }
      if (name === '@hozo/engine') return { HozoTextSizeContext: legacy }
      if (name === '@hozo/behaviors/pressable-interaction')
        return { HozoInteractionContext: interaction }
      if (name === '@hozo/primitives/generated/pressable')
        return { HozoPressable: 'UnusedPressable' }
      throw new Error(`Unexpected device fixture dependency: ${name}`)
    },
    module,
    module.exports,
  )
  return module.exports.TextInheritanceProbe
}

test('Native fixture uses one app React, preserves within-case identities and never certifies simulated callbacks', async () => {
  // esbuild's plugin API is asynchronous even for this tiny source graph.
  const Probe = await loadProbe()
  const original = console.info
  const observations = []
  console.info = (label, payload) => {
    assert.equal(label, '[Hozo text layout]')
    observations.push(JSON.parse(payload))
  }
  let tree
  try {
    renderer.act(() => {
      tree = renderer.create(react.createElement(Probe))
    })
    const press = (title) =>
      renderer.act(() =>
        tree.root
          .findAll(
            (node) => node.type === 'NativePressable' && node.props.accessibilityLabel === title,
          )[0]
          .props.onPress(),
      )
    const roots = () =>
      tree.root.findAll(
        (node) =>
          node.type === 'NativeText' &&
          /^(ordinary|reference|optimized) mount /.test(node.props.accessibilityLabel ?? ''),
      )
    const ids = () => roots().map((node) => node.props.accessibilityLabel.match(/mount (\d+)/)[1])
    const staticIds = ids()
    assert.equal(staticIds.length, 3)
    press('Change ancestor')
    assert.deepEqual(ids(), staticIds)
    assert.deepEqual(
      roots().map((node) => flatten(node.props.style).fontSize),
      [22, 22, 22],
    )
    press('Update label')
    assert.deepEqual(ids(), staticIds)
    assert.ok(roots().every((node) => /tick 1$/.test(node.props.accessibilityLabel)))
    press('Use runtime fallback')
    const runtimeIds = ids()
    assert.deepEqual(
      roots().map((node) => flatten(node.props.style).fontSize),
      [28, 28, 28],
    )
    press('Restore text fixture')
    assert.deepEqual(ids(), runtimeIds)
    assert.deepEqual(
      roots().map((node) => flatten(node.props.style).fontSize),
      [22, 22, 22],
    )
    const nested = roots().map(
      (node) => node.findAll((child) => child !== node && child.type === 'NativeText')[0],
    )
    assert.equal(
      flatten(nested[0].props.style).fontSize,
      undefined,
      'ordinary RN nested inheritance is not simulated',
    )
    assert.equal(flatten(nested[1].props.style).fontSize, 22)
    assert.equal(
      flatten(nested[2].props.style).fontSize,
      22,
      'unproved optimized module uses the shared fallback',
    )
    renderer.act(() =>
      roots()[2].props.onTextLayout({
        nativeEvent: { lines: [{ text: 'synthetic line', width: 100, height: 22 }] },
      }),
    )
    assert.equal(observations.length, 1)
    assert.equal(observations[0].react, react.version)
    assert.equal(observations[0].reactNative.minor, 86)
    assert.equal(observations[0].verdict, 'not-assessed')
    assert.deepEqual(observations[0].request, {
      kind: 'runtime',
      changed: false,
      tick: 0,
      mode: 'optimized',
    })
    assert.equal(observations[0].route, 'context-fallback')
    assert.equal(observations[0].lines[0].text, 'synthetic line')
    assert.deepEqual(ids(), runtimeIds)
  } finally {
    renderer.act(() => tree?.unmount())
    console.info = original
  }
})
