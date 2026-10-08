import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeModule, prepareAnalysisProject } from './analysis.ts'

test('project preparation loads once and supplies theme and reset consistently to both backends', async () => {
  const file = '/project/App.tsx'
  const source = `import { View, Heading } from '@hozo/core'; export const App = () => <View className="bg-brand p-4"><Heading>Title</Heading></View>`
  let calls = 0
  const context = await prepareAnalysisProject(
    { root: '/project', authoredSources: [{ file, source }] },
    async () => {
      calls++
      return {
        css: { status: 'resolved', value: '/project/global.css', origin: 'discovered' },
        theme: {
          status: 'resolved',
          value: { colors: [{ token: 'brand', oklch: '#123456', hex: '#123456' }], spacingPx: 3 },
          origin: 'discovered',
        },
        stylesheets: [],
      }
    },
  )
  assert.equal(calls, 1)
  assert.equal(context.projectFacts.preflight.value, true)
  assert.equal(context.compilerInputs.theme.preflight, true)
  assert.match(context.compiler.compile(source)[0]!.css, /#123456/)
  assert.match(context.compiler.compile(source)[0]!.css, /padding-top: 12px/)
  assert.match(context.compiler.compileNative(source)[0]!.styles, /#123456/)
  assert.match(context.compiler.compileNative(source)[0]!.styles, /paddingTop: 12/)
  analyzeModule(source, {
    compiler: context.compiler,
    root: '/project',
    file,
    targets: ['web', 'native'],
  })
  assert.equal(calls, 1, 'file analysis never reloads project facts')
})

test('trusted additions extend defaults and preflight follows shared conservative candidate facts', async () => {
  const source = `import { View } from '@acme/ui'; const documentation = 'className="p-4"'; export const App = () => <View />`
  const context = await prepareAnalysisProject(
    {
      root: '/project',
      authoredSources: [{ file: '/project/App.tsx', source }],
      primitiveSources: ['@acme/ui'],
    },
    async () => ({
      css: { status: 'absent', reason: 'no CSS' },
      theme: { status: 'absent', reason: 'no CSS' },
      stylesheets: [],
    }),
  )
  // The integration's usesTailwind scan is deliberately conservative: even
  // an unused utility-shaped string counts. Audit must not invent a narrower
  // reset policy and thereby compile different Native defaults from a build.
  assert.equal(context.projectFacts.preflight.value, true)
  assert.ok(context.compiler.sources.includes('react-native'))
  assert.ok(context.compiler.sources.includes('@hozo/core'))
  assert.ok(context.compiler.sources.includes('@acme/ui'))
  assert.equal(context.compiler.compile(source).length, 1)
  assert.equal(context.projectFacts.theme.status, 'defaulted')
})
