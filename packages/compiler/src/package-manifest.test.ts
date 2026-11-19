import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildPackageManifest,
  dependencyTextForwarding,
  serializeManifest,
  textForwardingModule,
  writeManifest,
} from './manifest.ts'
import { captureOwnerManifests } from './owner-manifest-capture.ts'
import { parseOwnerPackageShadow } from './owner-package.ts'
import { collectOwnerPackageContributions } from './owner-package-contributions.ts'

const text = {
  version: 1,
  textForwarding: {
    Button: {
      props: [{ name: 'tone', default: 'quiet', values: ['quiet', 'loud'] }],
      variants: [
        { when: ['quiet'], classes: 'text-sm' },
        { when: ['loud'], classes: 'font-bold' },
      ],
      disabledProp: 'disabled',
      hostStates: true as const,
    },
  },
}
function options() {
  return {
    exports: [
      { name: 'cn', owners: [] },
      { name: 'Button', owners: [] },
    ],
    owners: null,
    helpers: ['cn'],
    compiledByConsumer: true,
    sources: [
      { file: 'src/button.tsx', source: 'export const x = <Button className="p-4 hover:p-8" />' },
      {
        file: 'src/helper.ts',
        source: 'throw new Error("must never execute"); export const x = "p-2 p-4"',
      },
    ],
  }
}

test('package producer reuses Rust extraction and writes v2 with the text channel stored once', () => {
  const manifest = buildPackageManifest(text, options())
  assert.deepEqual(manifest.textForwarding, text.textForwarding)
  assert.equal(manifest.version, 2)
  assert.equal(Object.hasOwn(manifest, 'package'), false)
  assert.deepEqual(manifest.textPublish, [])
  assert.deepEqual(manifest.candidates, ['hover:p-8', 'p-2', 'p-4'])
  assert.deepEqual(
    manifest.exports.map((row) => row.name),
    ['Button', 'cn'],
  )
  assert.deepEqual(manifest.helpers, ['cn'])
  assert.equal(manifest.owners, null)
  assert.deepEqual(textForwardingModule('kit', manifest), textForwardingModule('kit', text))
  const reverse = options()
  reverse.sources.reverse()
  reverse.exports.reverse()
  assert.equal(serializeManifest(buildPackageManifest(text, reverse)), serializeManifest(manifest))
  const normalized = parseOwnerPackageShadow(serializeManifest(manifest))
  assert.deepEqual(normalized.textForwarding.textForwarding, text.textForwarding)
  assert.deepEqual(normalized.candidates, manifest.candidates)

  const edge = { importer: '/app/index.tsx', specifier: 'kit' }
  const capture = captureOwnerManifests(
    [edge],
    [
      {
        ...edge,
        status: 'resolved',
        instance: '/installed/kit',
        entry: '/installed/kit/index.ts',
        manifest: {
          kind: 'present',
          file: '/installed/kit/hozo.manifest.json',
          text: serializeManifest(manifest),
        },
      },
    ],
    { platform: 'ios', epoch: 'package-producer-test' },
  )
  const contribution = collectOwnerPackageContributions(capture)
  assert.equal(contribution.status, 'complete')
  if (contribution.status !== 'complete') return
  assert.deepEqual(contribution.candidates, manifest.candidates)
  assert.deepEqual(
    contribution.instances[0]!.data.textForwarding.textForwarding,
    text.textForwarding,
  )
  assert.ok(Object.isFrozen(contribution.instances[0]!.data.textForwarding))
})

test('v2 readers reject unsupported versions, missing channels and extra fields', () => {
  const manifest = buildPackageManifest(text, options())
  const invalid: unknown[] = [
    { ...manifest, version: 3 },
    { ...manifest, unknown: true },
    { ...manifest, schema: 'rfc010-package-shadow-0' },
    { ...manifest, package: {} },
  ]
  for (const key of Object.keys(manifest)) {
    if (key === 'version') continue
    const value = structuredClone(manifest) as unknown as Record<string, unknown>
    delete value[key]
    invalid.push(value)
  }
  for (const value of invalid)
    assert.throws(() => parseOwnerPackageShadow(JSON.stringify(value)), /Invalid owner package/)
})

test('a v1 envelope, as packages shipped it before v2, is still read with the same channels', () => {
  const manifest = buildPackageManifest(text, options())
  const { version, textForwarding, textPublish, ...channels } = manifest
  assert.equal(version, 2)
  assert.deepEqual(textPublish, [])
  const v1 = {
    version: 1,
    textForwarding,
    package: { schema: 'rfc010-package-shadow-0', ...channels },
  }
  const fromV1 = parseOwnerPackageShadow(JSON.stringify(v1))
  const fromV2 = parseOwnerPackageShadow(serializeManifest(manifest))
  assert.deepEqual(fromV1.textForwarding, text)
  assert.deepEqual({ ...fromV1, textForwarding: null }, { ...fromV2, textForwarding: null })
  assert.deepEqual(textForwardingModule('kit', v1), textForwardingModule('kit', manifest))
  const invalid = [
    { ...v1, version: 2 },
    { ...v1, package: { ...v1.package, textForwarding: text } },
    { ...v1, package: { ...v1.package, schema: 'future' } },
  ]
  for (const value of invalid)
    assert.throws(() => parseOwnerPackageShadow(JSON.stringify(value)), /Invalid owner package/)
})

test('producer rejects incomplete declarations and source/candidate budgets rather than truncating', () => {
  assert.throws(
    () => buildPackageManifest(text, { ...options(), exports: [] }),
    /helper export|text export/,
  )
  assert.throws(
    () =>
      buildPackageManifest(text, {
        ...options(),
        sources: [options().sources[0]!, options().sources[0]!],
      }),
    /unique source/,
  )
  assert.throws(
    () =>
      buildPackageManifest(text, {
        ...options(),
        sources: [{ file: 'bad\0.ts', source: '' }],
      }),
    /unique source/,
  )
  assert.throws(
    () =>
      buildPackageManifest(text, {
        ...options(),
        sources: Array.from({ length: 1025 }, (_, i) => ({ file: `${i}.tsx`, source: '' })),
      }),
    /source budget/,
  )
  assert.throws(
    () =>
      buildPackageManifest(text, {
        ...options(),
        sources: [{ file: 'large.ts', source: ' '.repeat(16_777_217) }],
      }),
    /source budget/,
  )
  assert.throws(
    () =>
      buildPackageManifest(text, {
        ...options(),
        sources: [
          {
            file: 'many.tsx',
            source: `const x = '${Array.from({ length: 513 }, (_, i) => `p-${i}`).join(' ')}'`,
          },
        ],
      }),
    /list budget/,
  )
})

test('package writer checks extended output and legacy dependency readers retain the same module', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-manifest-writer-'))
  try {
    const pkg = path.join(root, 'node_modules', 'kit')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { kit: '*' } }))
    writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ main: './index.tsx', hozo: { manifest: './hozo.manifest.json' } }),
    )
    writeFileSync(
      path.join(pkg, 'index.tsx'),
      `import { Button as Host } from '@hozo/primitives'
export function Button({ className, ...rest }) { return <Host {...rest} className="text-sm" /> }`,
    )
    const legacy = writeManifest(pkg)
    const before = dependencyTextForwarding(root)
    const extended = writeManifest(pkg, { package: options() })
    assert.equal(extended.current, true)
    assert.deepEqual(dependencyTextForwarding(root).modules, before.modules)
    assert.notEqual(dependencyTextForwarding(root).key, before.key)
    assert.deepEqual(
      JSON.parse(extended.text).textForwarding,
      JSON.parse(legacy.text).textForwarding,
    )
    assert.equal(writeManifest(pkg, { check: true, package: options() }).current, true)
    assert.equal(writeManifest(pkg, { check: true }).current, false)
    assert.equal(readFileSync(extended.file, 'utf8'), extended.text)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
