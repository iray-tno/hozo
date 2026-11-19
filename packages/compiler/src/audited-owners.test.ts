import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from './index.ts'
import { lowerModule, lowerModuleOrPrepare } from './lower.ts'
import { TailwindProjectSession } from './tailwind-session.ts'

test('ordinary Web lowering compiles Form, SubmitButton and FileDropzone literals by default', () => {
  const compiler = createCompiler()
  const source = `import { Form, SubmitButton, FileDropzone } from '@hozo/form'
export function Screen() {
  return (
    <Form className="flex flex-col gap-4">
      <FileDropzone accessibilityLabel="Upload" className="p-4 hover:bg-[#223344]" activeClassName="border-red-500">
        Drop
      </FileDropzone>
      <SubmitButton className="px-4 py-2 text-[#ffffff] disabled:opacity-50">Save</SubmitButton>
    </Form>
  )
}
`
  const lowered = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(lowered)
  assert.equal(lowered.needsClientBoundary, true)
  assert.doesNotMatch(lowered.code, /className="flex flex-col gap-4"/)
  assert.doesNotMatch(lowered.code, /className="p-4 hover:bg-\[#223344\]"/)
  assert.doesNotMatch(lowered.code, /className="px-4 py-2 text-\[#ffffff\] disabled:opacity-50"/)
  // Web-only activeClassName stays untouched until a contract covers it.
  assert.match(lowered.code, /activeClassName="border-red-500"/)
  assert.match(lowered.code, /className=\{"hozo-owner-/)
  assert.match(lowered.css, /gap:\s*16px/)
  assert.match(lowered.css, /padding:\s*16px|padding-top:\s*16px/)
  assert.match(lowered.css, /opacity:\s*(?:0?\.5|50%)/)
})

test('ordinary Web lowering composes audited form owners beside @hozo/core primitives and retains dynamic/spread sites', () => {
  const compiler = createCompiler()
  const source = `import { View } from '@hozo/core'
import { HozoForm as MyForm, HozoSubmitButton as MySubmit } from '@hozo/form'
export function Screen({ extra, dynamic }: { extra: Record<string, unknown>; dynamic: string }) {
  return (
    <View className="p-2">
      <MyForm className="gap-3">
        <MySubmit className="p-4">Go</MySubmit>
        <MySubmit className={dynamic}>Dyn</MySubmit>
        <MySubmit {...extra} className="p-6">Spread</MySubmit>
      </MyForm>
    </View>
  )
}
`
  const lowered = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(lowered)
  assert.match(lowered.code, /<div className="hozo-view hozo-/)
  assert.doesNotMatch(lowered.code, /className="gap-3"/)
  assert.doesNotMatch(lowered.code, /className="p-4"/)
  assert.match(lowered.code, /className=\{dynamic\}/)
  assert.match(lowered.code, /\{\.\.\.extra\} className="p-6"/)
  assert.match(lowered.css, /gap:\s*12px/)
})

test('lowerModuleOrPrepare collects audited form owner candidates into the shared Tailwind session', async () => {
  const compiler = createCompiler()
  const source = `import { Form, SubmitButton } from '@hozo/form'
export function Screen() {
  return (
    <Form className="p-4">
      <SubmitButton className="px-4 py-2">Go</SubmitButton>
    </Form>
  )
}
`
  const prepared = lowerModuleOrPrepare(
    source,
    '/app/Screen.tsx',
    '/app/Screen.tsx',
    compiler,
    '/app',
  )
  assert.equal(prepared.kind, 'prepared')
  assert.ok(prepared.module.candidates.includes('p-4'))
  assert.ok(prepared.module.candidates.includes('px-4'))
  assert.ok(prepared.module.candidates.includes('py-2'))
  const session = new TailwindProjectSession(compiler, async (names) =>
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'owner-lifecycle-test',
      fingerprint: 'a'.repeat(64),
      stylesheets: [],
      candidates: names.map((candidate, id) => ({
        id,
        candidate,
        status: 'described',
        firstRuleRank: null,
        rules: [
          {
            id,
            candidateId: id,
            variantOrder: '0',
            important: false,
            propertyOrder: [270],
            declarationCount: 1,
            shape: {
              kind: 'rule',
              selector: `.${candidate}`,
              nodes: [{ kind: 'declaration', property: 'padding', important: false }],
            },
          },
        ],
      })),
    }),
  )
  const emitted = await session.emit('screen', [() => prepared.module], prepared.module.candidates)
  const lowered = emitted[0]
  assert.ok(lowered)
  assert.match(lowered.code, /className=\{"hozo-owner-/)
  assert.match(lowered.css, /padding:\s*16px|padding-top:\s*16px/)
  assert.ok(prepareFinalTailwindContext)
})
