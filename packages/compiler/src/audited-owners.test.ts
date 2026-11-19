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

test('ordinary Web lowering compiles Field and TextArea literals across all audited slots', () => {
  const compiler = createCompiler()
  const source = `import { Field, TextArea } from '@hozo/form'
export function Screen({ dynamic }: { dynamic: string }) {
  return (
    <Field
      label="Bio"
      required
      description="Short bio"
      error="Too short"
      className="flex flex-col gap-2"
      labelClassName="text-sm font-bold"
      requiredClassName="text-[#cc0000]"
      descriptionClassName="text-[#555555]"
      errorClassName="text-[#aa0000]"
    >
      {(control) => (
        <TextArea
          id={control.id}
          aria-describedby={control['aria-describedby']}
          aria-invalid={control['aria-invalid']}
          aria-required={control['aria-required']}
          maxLength={100}
          className="flex flex-col gap-1"
          fieldClassName="p-2 focus-visible:bg-[#112233] disabled:opacity-50 read-only:bg-[#223344] aria-[invalid=true]:bg-[#334455] aria-required:bg-[#445566]"
          countClassName="text-[#666666]"
        />
      )}
    </Field>
  )
}
export function Dynamic({ value }: { value: string }) {
  return <TextArea fieldClassName={value} />
}
`
  const lowered = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(lowered)
  assert.doesNotMatch(lowered.code, /className="flex flex-col gap-2"/)
  assert.doesNotMatch(lowered.code, /labelClassName="text-sm font-bold"/)
  assert.doesNotMatch(lowered.code, /requiredClassName="text-\[#cc0000\]"/)
  assert.doesNotMatch(lowered.code, /descriptionClassName="text-\[#555555\]"/)
  assert.doesNotMatch(lowered.code, /errorClassName="text-\[#aa0000\]"/)
  assert.doesNotMatch(lowered.code, /className="flex flex-col gap-1"/)
  assert.doesNotMatch(lowered.code, /fieldClassName="p-2/)
  assert.doesNotMatch(lowered.code, /countClassName="text-\[#666666\]"/)
  assert.match(lowered.code, /labelClassName=\{"hozo-owner-/)
  assert.match(lowered.code, /fieldClassName=\{"hozo-owner-/)
  assert.match(lowered.code, /countClassName=\{"hozo-owner-/)
  assert.match(lowered.code, /fieldClassName=\{value\}/)
  assert.match(lowered.css, /font-weight:\s*700/)
  assert.match(lowered.css, /:read-only/)
  assert.match(lowered.css, /\[aria-invalid="true"\]/)
  assert.match(lowered.css, /\[aria-required="true"\]/)
})

test('ordinary Web lowering compiles NativeSelect className and leaves Native-only chrome slots untouched', () => {
  const compiler = createCompiler()
  const source = `import { NativeSelect } from '@hozo/form'
export function Screen() {
  return (
    <NativeSelect
      options={[{ value: 'a', label: 'A' }]}
      className="px-3 py-2 text-[#112233] disabled:opacity-50 aria-[invalid=true]:bg-[#223344] aria-required:bg-[#334455]"
      indicatorClassName="w-2 h-2"
      sheetClassName="p-4"
      scrimClassName="bg-[#000000]"
      optionClassName="px-2"
    />
  )
}
`
  const lowered = lowerModule(source, '/app/Screen.tsx', '/app/Screen.tsx', compiler, '/app')
  assert.ok(lowered)
  assert.doesNotMatch(lowered.code, /className="px-3 py-2/)
  assert.match(lowered.code, /className=\{"hozo-owner-/)
  assert.match(lowered.code, /indicatorClassName="w-2 h-2"/)
  assert.match(lowered.code, /sheetClassName="p-4"/)
  assert.match(lowered.code, /scrimClassName="bg-\[#000000\]"/)
  assert.match(lowered.code, /optionClassName="px-2"/)
  assert.match(lowered.css, /\[aria-invalid="true"\]/)
  assert.match(lowered.css, /\[aria-required="true"\]/)
})
