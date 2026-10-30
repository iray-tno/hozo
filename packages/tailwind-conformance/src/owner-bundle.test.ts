// Production component bundle with React/RN peers external, not a Metro app.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { evidenceSource } from '../../../scripts/style-slots/evidence-source.mjs'
import {
  handleRoot,
  prepareHandlePublication,
} from '../../../scripts/style-slots/handle-publication.mjs'

test('production component bundles exclude compiler machinery and measure both carrier/map costs', async () => {
  const evidence: Record<string, unknown> = {
    schema: 1,
    ...evidenceSource(),
    passed: false,
    scope: 'explicit-component-bundle-react-native-peers-external',
    adapterRollout: false,
  }
  const destination = path.join(handleRoot, 'artifacts/style-fact-model/handle-bundle.json')
  try {
    const fixture = await prepareHandlePublication()
    const measurements = []
    for (const [mode, source, candidate] of [
      ['opaque', fixture.source, fixture.before],
      ['prepared', fixture.prepared, fixture.after],
    ] as const) {
      const result = await build({
        stdin: {
          contents: source,
          resolveDir: path.join(handleRoot, 'packages/tailwind-conformance'),
          loader: 'tsx',
        },
        bundle: true,
        logLevel: 'silent',
        minify: true,
        treeShaking: true,
        write: false,
        metafile: true,
        format: 'esm',
        platform: 'neutral',
        jsx: 'automatic',
        mainFields: ['react-native', 'module', 'main'],
        conditions: ['react-native'],
        resolveExtensions: ['.native.tsx', '.native.ts', '.tsx', '.ts', '.js'],
        external: [
          'react',
          'react/*',
          'react-native',
          'react-native-*',
          '@react-native/*',
          'expo-*',
          '@expo/*',
        ],
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [
          {
            name: 'captured-project-candidate-map',
            setup(builder) {
              builder.onResolve({ filter: /^@hozo\/engine\/project$/ }, () => ({
                path: 'candidates',
                namespace: 'captured',
              }))
              builder.onLoad({ filter: /.*/, namespace: 'captured' }, () => ({
                contents: candidate.code,
                loader: 'js',
                resolveDir: path.join(handleRoot, 'packages/tailwind-conformance'),
              }))
            },
          },
        ],
      })
      const code = result.outputFiles[0]!.text
      const inputs = Object.keys(result.metafile!.inputs)
      assert.ok(inputs.some((name) => name.endsWith('patterns/dist/bottom-sheet.native.js')))
      assert.ok(
        result.warnings.every(
          (warning) =>
            warning.id === 'ignored-bare-import' &&
            warning.location?.file.endsWith('engine/dist/index.native.js') &&
            warning.text.includes('class-name.native.js'),
        ),
        'only the erased RN type-augmentation import may be dropped',
      )
      assert.ok(
        !inputs.some((name) => /(?:compiler|tailwind)\/src|scripts\/style-slots/.test(name)),
      )
      assert.ok(!code.includes('explicit-collected-compiler-preview'))
      assert.ok(!code.includes('rfc010-owner-shadow-0'))
      const entries = candidate.entries.map((entry) => entry.candidate)
      if (mode === 'opaque') assert.ok(entries.includes('p-2'), 'positive candidate-map control')
      else assert.deepEqual(entries, [], 'this exact rewritten source requests no runtime names')
      const peers = [
        ...new Set(
          Object.values(result.metafile!.outputs).flatMap((output) =>
            output.imports.filter((entry) => entry.external).map((entry) => entry.path),
          ),
        ),
      ].sort()
      measurements.push({
        mode,
        bytes: Buffer.byteLength(code),
        gzipBytes: gzipSync(code).length,
        sha256: createHash('sha256').update(code).digest('hex'),
        candidateBytes: Buffer.byteLength(candidate.code),
        candidateEntries: entries.length,
        peers,
      })
    }
    const [before, after] = measurements
    assert.ok(before && after)
    assert.deepEqual(
      after.peers,
      before.peers,
      'carrier changes do not add runtime peer dependencies',
    )
    Object.assign(evidence, {
      passed: true,
      fingerprint: fixture.fingerprint,
      measurements,
      delta: { bytes: after.bytes - before.bytes, gzipBytes: after.gzipBytes - before.gzipBytes },
    })
  } catch (error) {
    evidence.error =
      error instanceof Error ? { name: error.name, message: error.message } : String(error)
    throw error
  } finally {
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`)
    console.info(JSON.stringify(evidence))
  }
})
