import assert from 'node:assert/strict'
import test from 'node:test'
import { ownerFixtureShadow } from '../../../scripts/style-slots/owner-fixture.mjs'
import { createCompiler, prepareFinalTailwindContext } from './index.ts'
import { prepareOwnerLiteralCallers } from './owner-caller-plan.ts'

const options = {
  source: '@hozo/patterns',
  imported: 'BottomSheet',
  shadow: ownerFixtureShadow('BottomSheet.handle'),
}
const source = `import {BottomSheet as Sheet} from '@hozo/patterns';
export const A=()=> <><Sheet handleClassName="p-2"/><Sheet handleClassName="p-2"/><Sheet handleClassName={input.value}/></>`

// A controlled namespace for lifecycle assertions, not Tailwind fidelity evidence.
function context(names = ['p-2']) {
  return prepareFinalTailwindContext(
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
            id: 0,
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

function tracked() {
  const compiler = createCompiler()
  const prepare = compiler.prepareNativeModule.bind(compiler)
  const observations: { emitted: unknown[]; disposals: number }[] = []
  compiler.prepareNativeModule = (...args) => {
    const module = prepare(...args)
    const observation = { emitted: [] as unknown[], disposals: 0 }
    observations.push(observation)
    return {
      candidates: module.candidates,
      emit(current) {
        observation.emitted.push(current)
        return module.emit(current)
      },
      dispose() {
        observation.disposals++
        module.dispose()
      },
    }
  }
  compiler.compileNativeModule = () => {
    throw new Error('no direct compile fallback')
  }
  compiler.setTailwindOrder = () => {
    throw new Error('no global ordering setter')
  }
  return { compiler, observations }
}

test('collected callers retain one parse per distinct literal/shape and consume the exact supplied context once', async () => {
  const { compiler, observations } = tracked()
  const mutableOptions = { ...options }
  const module = prepareOwnerLiteralCallers(source, compiler, mutableOptions)
  assert.equal(observations.length, 2, 'two shapes, not two copies for identical callers')
  assert.deepEqual(module.candidates, ['p-2'])
  assert.ok(Object.isFrozen(module.candidates))
  assert.ok(observations.every((row) => row.emitted.length === 0))
  mutableOptions.shadow = '{}'
  mutableOptions.imported = 'Foreign'
  await Promise.resolve()
  const final = context()
  const output = module.emit(final)
  assert.equal(output.scope, 'explicit-collected-compiler-preview')
  assert.equal(output.contextFingerprint, final.fingerprint)
  assert.equal(output.findings.filter((f) => f.disposition === 'prepared-literal').length, 2)
  assert.equal(output.findings[2]!.reason, 'nonliteral')
  assert.match(output.code, /handleClassName=\{input.value\}/)
  assert.equal((output.code.match(/\.create\(/g) ?? []).length, 1)
  for (const row of observations) {
    assert.deepEqual(row.emitted, [final])
    assert.equal(row.disposals, 1)
  }
  assert.throws(() => module.emit(final), /already been emitted or disposed/)
  module.dispose()
  module.dispose()
  assert.ok(observations.every((row) => row.disposals === 1))
})

test('an incomplete context releases all shapes before any partial emission, without a direct fallback', () => {
  const { compiler, observations } = tracked()
  const module = prepareOwnerLiteralCallers(source, compiler, options)
  assert.throws(() => module.emit(context([])), /did not collect p-2/)
  assert.ok(observations.every((row) => row.emitted.length === 0 && row.disposals === 1))
  assert.throws(() => module.emit(context()), /already been emitted or disposed/)
  const disposed = prepareOwnerLiteralCallers(source, compiler, options)
  disposed.dispose()
  disposed.dispose()
  assert.throws(() => disposed.emit(context()), /already been emitted or disposed/)
  assert.ok(observations.every((row) => row.disposals === 1))
})

test('failure during collection or shape emission releases already acquired IR and publishes nothing', () => {
  for (const stage of ['prepare', 'candidates', 'emit']) {
    const { compiler, observations } = tracked()
    const prepare = compiler.prepareNativeModule.bind(compiler)
    let count = 0
    compiler.prepareNativeModule = (...args) => {
      const index = ++count
      if (index === 2 && stage === 'prepare') throw new Error(stage)
      const module = prepare(...args)
      return {
        get candidates() {
          if (stage === 'candidates') throw new Error(stage)
          return module.candidates
        },
        emit(current) {
          if (index === 2 && stage === 'emit') throw new Error(stage)
          return module.emit(current)
        },
        dispose: () => module.dispose(),
      }
    }
    assert.throws(
      () => prepareOwnerLiteralCallers(source, compiler, options).emit(context()),
      new RegExp(stage),
    )
    assert.ok(observations.length > 0)
    assert.ok(
      observations.every((row) => row.disposals === 1),
      stage,
    )
  }
})

test('opaque/unsafe and malformed callers do not acquire synthetic plans or disappear', () => {
  for (const input of [
    `import {BottomSheet} from '@hozo/patterns'; const a=<BottomSheet handleClassName={choose()}/>`,
    `import {BottomSheet} from '@hozo/patterns'; const a=<BottomSheet {...props} handleClassName="p-2"/>`,
    `import {BottomSheet} from '@hozo/patterns'; const a=;`,
  ]) {
    const { compiler, observations } = tracked()
    const module = prepareOwnerLiteralCallers(input, compiler, options)
    assert.deepEqual(module.candidates, [])
    const output = module.emit(context([]))
    assert.equal(output.code, input)
    assert.equal(observations.length, 0)
    assert.ok(output.findings.length || output.diagnostics.length)
  }
})
