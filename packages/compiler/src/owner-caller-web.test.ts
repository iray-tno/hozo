import assert from 'node:assert/strict'
import test from 'node:test'
import { ownerFixtureShadow } from '../../../scripts/style-slots/owner-fixture.mjs'
import { createCompiler, prepareFinalTailwindContext } from './index.ts'
import { prepareOwnerLiteralCallers, previewOwnerLiteralCallers } from './owner-caller-plan.ts'

const options = {
  source: '@hozo/patterns',
  imported: 'BottomSheet',
  shadow: ownerFixtureShadow('BottomSheet.handle'),
  target: 'web' as const,
}
const caller = (props: string) =>
  `import {BottomSheet as Sheet} from '@hozo/patterns';export const App=()=> <Sheet ${props}/>`

// Controlled lifecycle descriptors, not independent CSS/Tailwind fidelity evidence.
function context(names = ['p-2']) {
  return prepareFinalTailwindContext(
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'owner-web-lifecycle',
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
              selector: '.p-2',
              nodes: [{ kind: 'declaration', property: 'padding', important: false }],
            },
          },
        ],
      })),
    }),
  )
}

test('Web caller preparation keeps the real owner and authored inputs and namespaces each distinct recipe', () => {
  const compiler = createCompiler()
  const input = `#!/usr/bin/env node\n'use client';
import {BottomSheet as Sheet} from '@hozo/patterns';
export const A=()=> <><Sheet open handleStyle={author.value} handleClassName="p-2 hover:opacity-50"/><Sheet handleClassName="p-2 hover:opacity-50"/><Sheet handleClassName="p-4"/></>`
  const result = previewOwnerLiteralCallers(input, compiler, options)
  assert.deepEqual(result.diagnostics, [])
  assert.ok(result.findings.every((row) => row.disposition === 'prepared-literal'))
  assert.ok(result.code.startsWith("#!/usr/bin/env node\n'use client';"))
  assert.equal(result.code.split('author.value').length - 1, 1)
  assert.doesNotMatch(result.code, /react-native|StyleSheet|hozoHandleStyle|<View|<Pressable/)
  assert.doesNotMatch(result.css!, /hozo-view|\.hozo-0\b/)
  const names = [...result.code.matchAll(/handleClassName=\{"([^"]+)"\}/g)].map((row) => row[1])
  assert.equal(names.length, 3)
  assert.equal(names[0], names[1], 'identical literals share one emitted class recipe')
  assert.notEqual(names[0], names[2])
  for (const name of names) assert.ok(result.css!.includes(`.${name}`))
  assert.match(result.css!, /:hover/)
  assert.deepEqual(
    previewOwnerLiteralCallers(input, compiler, {
      ...options,
      sourceFile: '/another-checkout/Owner.tsx',
    }),
    result,
    'recipe content/CSS names do not contain absolute checkout paths',
  )
  const otherTheme = createCompiler({ colors: [], spacingPx: 7 })
  const changed = previewOwnerLiteralCallers(input, otherTheme, options)
  assert.notEqual(
    changed.code,
    result.code,
    'same source under a different CSS recipe cannot collide',
  )
  assert.match(changed.css!, /padding-top: 14px/)
  assert.equal(previewOwnerLiteralCallers(result.code, compiler, options).code, result.code)
})

test('unsafe, opaque, incomplete and foreign Web callers retain the whole authored input without orphan CSS', () => {
  const compiler = createCompiler()
  for (const props of [
    'handleClassName={input.value}',
    'handleClassName="p-2 unknown-owner-class"',
    '{...rest} handleClassName="p-2"',
    'handleClassName="p-2" hozoHandleStyle={own}',
  ]) {
    const input = caller(props)
    const result = previewOwnerLiteralCallers(input, compiler, options)
    assert.equal(result.code, input)
    assert.equal(result.css, '')
    assert.equal(result.findings[0]!.disposition, 'retained')
  }
  const foreign = caller('handleClassName="p-2"').replace('@hozo/patterns', 'foreign')
  assert.equal(previewOwnerLiteralCallers(foreign, compiler, options).code, foreign)
  assert.throws(
    () =>
      previewOwnerLiteralCallers(foreign, compiler, {
        ...options,
        target: 'invalid' as 'web',
      }),
    /Unsupported owner caller target/,
  )
})

test('collected Web callers own one parse per distinct shape and consume the same supplied context once', () => {
  const compiler = createCompiler()
  const original = compiler.prepareWebModule.bind(compiler)
  const rows: { emitted: unknown[]; disposed: number }[] = []
  let failSecondShape = false
  compiler.prepareWebModule = (...args) => {
    const module = original(...args)
    const row = { emitted: [] as unknown[], disposed: 0 }
    rows.push(row)
    return {
      candidates: module.candidates,
      preview: () => module.preview(),
      emit(value) {
        row.emitted.push(value)
        if (failSecondShape && rows.indexOf(row) === 1) throw new Error('second Web shape failed')
        return module.emit(value)
      },
      dispose() {
        row.disposed++
        module.dispose()
      },
    }
  }
  compiler.compile = () => {
    throw new Error('no direct fallback')
  }
  compiler.compileNativeModule = () => {
    throw new Error('not a Native request')
  }
  const source = caller('handleClassName="p-2"')
  const retained = prepareOwnerLiteralCallers(source, compiler, options)
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.emitted.length === 0))
  const exact = context()
  const output = retained.emit(exact)
  assert.equal(output.contextFingerprint, exact.fingerprint)
  assert.equal(output.findings[0]!.disposition, 'prepared-literal')
  assert.ok(output.css)
  assert.ok(
    rows.every((row) => row.emitted.length === 1 && row.emitted[0] === exact && row.disposed === 1),
  )
  assert.throws(() => retained.emit(exact), /already been emitted or disposed/)
  rows.length = 0
  const incomplete = prepareOwnerLiteralCallers(source, compiler, options)
  assert.throws(() => incomplete.emit(context([])), /did not collect p-2/)
  assert.ok(rows.every((row) => row.emitted.length === 0 && row.disposed === 1))
  rows.length = 0
  const discarded = prepareOwnerLiteralCallers(source, compiler, options)
  discarded.dispose()
  assert.ok(rows.every((row) => row.emitted.length === 0 && row.disposed === 1))
  rows.length = 0
  failSecondShape = true
  const failed = prepareOwnerLiteralCallers(source, compiler, options)
  assert.throws(() => failed.emit(exact), /second Web shape failed/)
  assert.ok(rows.every((row) => row.disposed === 1))
  assert.throws(() => failed.emit(exact), /already been emitted or disposed/)
})
