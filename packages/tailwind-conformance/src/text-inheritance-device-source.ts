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
// Selection/proof inputs, in addition to the unchanged shipped leaf graph.
// The run's driverCommit pins the complete checkout, not just these files.
const productionStaticSources = [
  'packages/compiler/src/index.ts',
  'packages/metro/src/transform.ts',
  'crates/hozo_napi/src/lib.rs',
  'crates/hozo_napi/src/tailwind_order.rs',
  'crates/hozo_parser/src/lib.rs',
  'crates/hozo_parser/src/interaction_order.rs',
  'crates/hozo_parser/src/jsx.rs',
  'crates/hozo_parser/src/stylex.rs',
  'crates/hozo_parser/src/tailwind_variants.rs',
  'crates/hozo_parser/src/text_regions.rs',
  'crates/hozo_native/src/lib.rs',
  'crates/hozo_native/src/conditions.rs',
  'crates/hozo_native/src/text_region.rs',
  'crates/hozo_native/src/style.rs',
  'crates/hozo_native/src/render.rs',
  'crates/hozo_native/src/text.rs',
  'crates/hozo_ir/src/lib.rs',
  'crates/hozo_ir/src/tailwind_units.rs',
  'crates/hozo_ir/src/tailwind_order.rs',
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
    const compile = (mode: 'ordinary' | 'reference' | 'production' | 'production-static') =>
      transformHozoSource(source, `${name}.tsx`, undefined, {
        ...compiler,
        compileNativeModule(input, bindings, file) {
          return compiler.compileNativeModule(input, bindings, file, {
            textReference: mode === 'reference',
            textInheritance: mode === 'production' || mode === 'production-static',
            textStatic: mode === 'production-static',
          })
        },
      }) ?? source
    const ordinary = compile('ordinary'),
      reference = compile('reference'),
      production = compile('production'),
      productionStatic = compile('production-static')
    assert.equal(ordinary, reference, 'this fixture must preserve ordinary compiler output')
    assert.match(production, /from '@hozo\/core\/generated\/inherited-text'/)
    assert.doesNotMatch(production, /ReferenceText/)
    // Classify the actual compiler result, never the case name or private
    // Babel proof. A third/unexpected result cannot certify the candidate.
    const productionStaticRoute =
      productionStatic === ordinary ? 'plain-native' : 'context-fallback'
    assert.equal(productionStatic, productionStaticRoute === 'plain-native' ? ordinary : production)
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
                  if (
                    runtime &&
                    path.node.source.value === 'react-native' &&
                    specifier.imported.name === 'Text'
                  ) {
                    // Keep the real compiled RN binding, distinct from the
                    // controls' injected Text parameters in the generated file.
                    path.scope.rename(specifier.local.name, 'NativeText')
                  }
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
      productionStatic,
      productionStaticRoute,
      body: factoryBody(reference, false),
      productionBody: factoryBody(production, true),
      productionStaticBody: factoryBody(productionStatic, true),
      proof,
    }
  })
  const manifest = {
    schemaVersion: 3,
    scope: 'private device-fixture preparation; not a Native correctness or timing result',
    coreSha256: hash(read('./text-inheritance-reference-core.ts')),
    production: {
      route: 'context-runtime; no static erasure',
      sourceSha256: Object.fromEntries(
        productionSources.map((file) => [file, hash(read(`../../../${file}`))]),
      ),
    },
    productionStatic: {
      selection: { textInheritance: true, textStatic: true },
      route: 'per-region proof; runtime fallback on missing proof',
      sourceSha256: Object.fromEntries(
        productionStaticSources.map((file) => [file, hash(read(`../../../${file}`))]),
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
    cases: cases.map(
      ({
        name,
        source,
        ordinary,
        reference,
        production,
        productionStatic,
        productionStaticRoute,
        proof,
      }) => ({
        name,
        sourceSha256: hash(source),
        ordinarySha256: hash(
          name === 'opaque' ? cases.find((entry) => entry.name === 'runtime')!.ordinary : ordinary,
        ),
        referenceSha256: hash(reference),
        productionSha256: hash(production),
        productionStaticSha256: hash(productionStatic),
        productionStaticRoute,
        ...(name === 'opaque'
          ? {
              ordinaryControl: {
                sourceSha256: hash(cases.find((entry) => entry.name === 'runtime')!.source),
                method:
                  'explicit frame prop on the existing runtime RN label, not a Context reader',
              },
            }
          : {}),
        route: proof.plainText ? 'plain-native' : 'context-fallback',
        proof: proof.boundary,
        decisions: proof.decisions,
      }),
    ),
  }
  // This is the compiler's actual RN export, not an injected Text. A named
  // Text import would cause Metro to lower the already-compiled region a
  // second time; the namespace alias keeps this fixture idempotent without
  // adding a skip pragma or changing the compiler's normal import policy.
  const code = `// Generated by scripts/generate-text-inheritance.mjs. Do not edit.\n// Controls retain fixed injected Text; production retains compiled RN/ABI bindings.\n// The opaque ordinary control uses createRuntimeLabel with explicit props.\n// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Proof subjects retain authored template syntax as data.\nimport {memo,useState,type ComponentType} from 'react'\nimport * as Native from 'react-native'\nimport {StyleSheet,type TextProps,type TextStyle} from 'react-native'\nimport {HozoInheritedText} from '@hozo/core/generated/inherited-text'\nconst NativeText = Native.Text\n\nexport const textFixtureManifest = ${JSON.stringify(manifest, null, 2)} as const\n\n${cases.map(({ name, body, productionBody, productionStaticBody }) => `export function create${name[0].toUpperCase() + name.slice(1)}Label(Text: ComponentType<TextProps & Record<string, unknown>>) {\n${body}\nreturn Label\n}\nexport function createProduction${name[0].toUpperCase() + name.slice(1)}Label() {\n${productionBody}\nreturn Label\n}\nexport function createProductionStatic${name[0].toUpperCase() + name.slice(1)}Label() {\n${productionStaticBody}\nreturn Label\n}\n`).join('\n')}`
  return { code, manifest, cases }
}
