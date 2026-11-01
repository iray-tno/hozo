import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareTailwindContext } from './index.ts'

const source = (tag: string, props: string) =>
  `import {${tag}} from '@hozo/primitives';export const Plan=()=> <${tag} ${props}/>`

test('explicit retained Web preparation exposes the real class without extracting JSX or synthetic defaults', () => {
  const compiler = createCompiler()
  for (const tag of ['View', 'Pressable']) {
    const input = source(tag, 'className="p-2 hover:opacity-50 aria-selected:text-[#223344]"')
    const ordinary = compiler.compile(input)[0]!
    const retained = compiler.prepareWebModule(input, undefined, { ownerClass: true })
    try {
      const prepared = retained.preview()[0]!
      assert.equal(prepared.ownerClass, 'hozo-0')
      assert.equal(prepared.jsx, ordinary.jsx)
      assert.equal(prepared.css, ordinary.css)
      assert.doesNotMatch(prepared.ownerClass!, /hozo-view/)
      assert.deepEqual(prepared.runtimeImports, [])
      assert.deepEqual(prepared.diagnostics, [])
      assert.match(prepared.css, /\.hozo-0/)
      assert.equal(ordinary.ownerClass, undefined)
    } finally {
      retained.dispose()
    }
    assert.deepEqual(compiler.compile(input)[0], ordinary, 'the request cannot become sticky')
  }
})

test('a class carrier cannot discard residuals, unknown classes, authored props or child/host effects', () => {
  const compiler = createCompiler()
  for (const props of [
    // biome-ignore lint/suspicious/noTemplateCurlyInString: authored TSX fixture, not interpolation here
    'className={`p-2 ${input.value}`}',
    'className={on ? "p-2" : "p-4"}',
    'className="p-2 custom-owner"',
    'className="p-2" style={author.value}',
    'className="p-2" {...rest}',
    'className="p-2" disabled',
    'className="p-2" onPress={activate}',
  ]) {
    const input = source('Pressable', props)
    const ordinary = compiler.compile(input)[0]!
    const retained = compiler.prepareWebModule(input, undefined, { ownerClass: true })
    try {
      const output = retained.preview()[0]!
      assert.equal(output.ownerClass, undefined, input)
      assert.equal(output.jsx, ordinary.jsx)
      assert.equal(output.css, ordinary.css)
      assert.ok(
        output.diagnostics.some((d) => d.severity === 'error'),
        input,
      )
    } finally {
      retained.dispose()
    }
  }
})

test('retained Web class preparation captures options/theme and has the ordinary one-shot lifetime', () => {
  const compiler = createCompiler({
    colors: [{ token: 'ink', oklch: 'oklch(50% 0.1 20)', hex: '#123456' }],
  })
  const options = { ownerClass: true, tagEvidence: true }
  const retained = compiler.prepareWebModule(
    source('View', 'className="bg-ink"'),
    undefined,
    options,
  )
  options.ownerClass = false
  assert.deepEqual(retained.candidates, ['bg-ink'])
  const preview = retained.preview()[0]!
  assert.equal(preview.ownerClass, 'hozo-0')
  assert.ok(preview.tagDecisions?.length)
  // A controlled transport context, not a Tailwind-fidelity/ordering oracle.
  const context = prepareTailwindContext(
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'web-owner-transport-unit',
      fingerprint: 'c'.repeat(64),
      stylesheets: [],
      candidates: [],
    }),
  )
  const output = retained.emit(context)[0]!
  assert.equal(output.ownerClass, preview.ownerClass)
  assert.match(output.css, /oklch\(50% 0.1 20\)/)
  assert.deepEqual(output.jsx, preview.jsx)
  assert.throws(() => retained.preview(), /already been emitted or disposed/)
  assert.throws(() => retained.emit(context), /already been emitted or disposed/)
  retained.dispose()
  const discarded = compiler.prepareWebModule(source('View', 'className="p-2"'), undefined, {
    ownerClass: true,
  })
  discarded.dispose()
  assert.throws(() => discarded.preview(), /already been emitted or disposed/)
})
