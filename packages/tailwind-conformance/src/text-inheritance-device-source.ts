// Node-only fixture preparation. Never imported by the Native application.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { types as t, transformSync } from '@babel/core'
import { createCompiler } from '../../compiler/src/index.ts'
import { transformHozoSource } from '../../metro/src/transform.ts'
import { proveNativeTextRegion } from './text-inheritance-closed-proof.ts'

const read = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const hash = (source: string) => createHash('sha256').update(source).digest('hex')
export const deviceLabelSource = () => read('../fixtures/native-text-label.tsx')
// Pin the actual leaf graph, not just the reference algorithm and label.
const productionSources = [
  'packages/core/src/generated/inherited-text.ts',
  'packages/core/src/generated/inherited-view.ts',
  'packages/engine/src/generated/text-inheritance-protocol.ts',
  'packages/engine/src/generated/text-size-context.ts',
  'packages/engine/src/text-inheritance.ts',
  'packages/engine/src/text-size.ts',
  'packages/primitives/src/generated/inherited-text.ts',
  'packages/primitives/src/generated/inherited-view.ts',
  'packages/primitives/src/inherited-text.native.tsx',
  'packages/primitives/src/inherited-view.native.tsx',
  'packages/primitives/src/inherited-text-scope.tsx',
  'packages/primitives/src/inherited-text-style.native.ts',
]

export function prepareTextDeviceFixture(staticSource = deviceLabelSource()) {
  const compiler = createCompiler()
  const cases = [
    { name: 'static', source: staticSource },
    // A real runtime override must fail the static proof. Do not choose its
    // binding by case name or by the value of frame on the initial render.
    {
      name: 'runtime',
      source: staticSource
        .replace('{ name, tick, onTextLayout }', '{ name, tick, frame, onTextLayout }')
        .replace('accessibilityRole="text"', 'style={frame} accessibilityRole="text"'),
    },
    { name: 'opaque', source: read('../fixtures/native-text-opaque-label.tsx') },
  ].map(({ name, source }) => {
    const compile = (mode: 'ordinary' | 'reference' | 'production') =>
      transformHozoSource(source, `${name}.tsx`, undefined, {
        ...compiler,
        compileNativeModule(input, bindings, file) {
          return compiler.compileNativeModule(input, bindings, file, {
            textReference: mode === 'reference',
            textInheritance: mode === 'production',
          })
        },
      }) ?? source
    const ordinary = compile('ordinary'),
      reference = compile('reference'),
      production = compile('production')
    assert.equal(ordinary, reference, 'this fixture must preserve ordinary compiler output')
    assert.match(production, /from '@hozo\/core\/generated\/inherited-text'/)
    assert.doesNotMatch(production, /ReferenceText/)
    const proof = proveNativeTextRegion(reference)
    const factoryBody = (compiled: string, runtime: boolean) =>
      transformSync(compiled, {
        filename: `${name}.tsx`,
        configFile: false,
        babelrc: false,
        parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
        plugins: [
          () => ({
            visitor: {
              ImportDeclaration(path) {
                assert.ok(
                  [
                    'react',
                    'react-native',
                    ...(runtime ? ['@hozo/core/generated/inherited-text'] : []),
                  ].includes(path.node.source.value),
                )
                for (const specifier of path.node.specifiers) {
                  assert.ok(t.isImportSpecifier(specifier))
                  assert.ok(t.isIdentifier(specifier.imported))
                  assert.equal(specifier.local.name, specifier.imported.name)
                  assert.ok(
                    [
                      'Text',
                      'StyleSheet',
                      'memo',
                      'useState',
                      'TextProps',
                      'TextStyle',
                      ...(runtime ? ['HozoInheritedText'] : []),
                    ].includes(specifier.local.name),
                  )
                }
                path.remove()
              },
              ExportNamedDeclaration(path) {
                assert.ok(path.node.declaration)
                path.replaceWith(path.node.declaration)
              },
            },
          }),
        ],
      })!.code!
    return {
      name,
      source,
      ordinary,
      reference,
      production,
      body: factoryBody(reference, false),
      productionBody: factoryBody(production, true),
      proof,
    }
  })
  const manifest = {
    schemaVersion: 2,
    scope: 'private device-fixture preparation; not a Native correctness or timing result',
    coreSha256: hash(read('./text-inheritance-reference-core.ts')),
    production: {
      route: 'context-runtime; no static erasure',
      sourceSha256: Object.fromEntries(
        productionSources.map((file) => [file, hash(read(`../../../${file}`))]),
      ),
    },
    proofSha256: hash(
      [
        './text-inheritance-closed-proof.ts',
        './text-inheritance-proof-boundary.ts',
        './text-inheritance-style-proof.ts',
        './text-inheritance-fixtures.ts',
      ]
        .map(read)
        .join('\n'),
    ),
    cases: cases.map(({ name, source, ordinary, reference, production, proof }) => ({
      name,
      sourceSha256: hash(source),
      ordinarySha256: hash(
        name === 'opaque' ? cases.find((entry) => entry.name === 'runtime')!.ordinary : ordinary,
      ),
      referenceSha256: hash(reference),
      productionSha256: hash(production),
      ...(name === 'opaque'
        ? {
            ordinaryControl: {
              sourceSha256: hash(cases.find((entry) => entry.name === 'runtime')!.source),
              method: 'explicit frame prop on the existing runtime RN label, not a Context reader',
            },
          }
        : {}),
      route: proof.plainText ? 'plain-native' : 'context-fallback',
      proof: proof.boundary,
      decisions: proof.decisions,
    })),
  }
  const code = `// Generated by scripts/generate-text-inheritance.mjs. Do not edit.\n// Controls retain fixed injected Text; production uses actual compiler ABI imports.\n// The opaque ordinary control uses createRuntimeLabel with explicit props.\n// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Proof subjects retain authored template syntax as data.\nimport {memo,useState,type ComponentType} from 'react'\nimport {StyleSheet,type TextProps,type TextStyle} from 'react-native'\nimport {HozoInheritedText} from '@hozo/core/generated/inherited-text'\n\nexport const textFixtureManifest = ${JSON.stringify(manifest, null, 2)} as const\n\n${cases.map(({ name, body, productionBody }) => `export function create${name[0].toUpperCase() + name.slice(1)}Label(Text: ComponentType<TextProps & Record<string, unknown>>) {\n${body}\nreturn Label\n}\nexport function createProduction${name[0].toUpperCase() + name.slice(1)}Label() {\n${productionBody}\nreturn Label\n}\n`).join('\n')}`
  return { code, manifest, cases }
}
