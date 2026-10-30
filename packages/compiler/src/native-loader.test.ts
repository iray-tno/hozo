import assert from 'node:assert/strict'
import test from 'node:test'

import { createCompiler, openCandidateCache, prepareTailwindContext } from './index.ts'
import { loadNativeBinding, nativePackageName } from './native-loader.ts'

test('the host addon returns owner-style metadata only for an explicit assessed request', () => {
  const compiler = createCompiler()
  const source = `import {Pressable} from '@hozo/core'; export const X=()=> <Pressable className="p-2 focus-visible:opacity-50"/>`
  const ordinary = compiler.compileNativeModule(source)
  const prepared = compiler.compileNativeModule(source, undefined, undefined, { ownerStyle: true })
  assert.ok(ordinary.components[0]!.ownerStyle == null)
  assert.ok(prepared.components[0]!.ownerStyle?.callback)
  assert.equal(prepared.components[0]!.ownerStyle!.focusVisible, true)
  assert.ok(prepared.components[0]!.jsx.includes(prepared.components[0]!.ownerStyle!.expression))
  assert.equal(prepared.components[0]!.styles, ordinary.components[0]!.styles)
})

test('the host addon exposes compatible candidate replay on every platform smoke path', () => {
  const cache = openCandidateCache()
  cache.scanFile('entry', `export const tone=()=> 'p-4 bg-red-500'`, 1)
  const record = cache.exportFile('entry')!
  const restored = openCandidateCache()
  restored.importFile('entry', record, 2)
  assert.equal(restored.renderCss(), cache.renderCss())
  assert.equal(restored.renderNativeModule(), cache.renderNativeModule())
  assert.equal(restored.isCurrent('entry', 2), true)
})

test('the host addon exposes shared rule order and priorities on every platform smoke path', () => {
  const snapshot = {
    schema: 1,
    policy: 'tailwind-rule-signatures-v1',
    tailwindVersion: 'host-smoke',
    fingerprint: 'a'.repeat(64),
    stylesheets: [],
    candidates: ['p-10', 'p-2'].map((candidate, id) => ({
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
  }
  const context = prepareTailwindContext(JSON.stringify(snapshot))
  assert.deepEqual(context.ruleOrder(), {
    fingerprint: snapshot.fingerprint,
    rules: [
      { candidateId: 1, ruleId: 1 },
      { candidateId: 0, ruleId: 0 },
    ],
  })
  const priorities = context.rulePriorities()
  assert.equal(priorities.fingerprint, snapshot.fingerprint)
  assert.deepEqual(
    priorities.rules.map(({ ruleId, rank }) => [ruleId, rank]),
    [
      [1, 0],
      [0, 1],
    ],
  )
  assert.ok(
    priorities.rules.every(
      ({ important, specificity }) =>
        important === false && JSON.stringify(specificity) === '[0,1,0]',
    ),
  )
  const cache = openCandidateCache()
  cache.scanFile('entry', `export const classes='p-10 p-2'`, 1)
  const generated = cache.renderNativeModulePlan(context)
  assert.equal(generated.schema, 1)
  assert.equal(generated.fingerprint, snapshot.fingerprint)
  assert.equal(generated.code, cache.renderNativeModule())
  assert.equal(generated.entries.length, 2)
  assert.equal(generated.ordering!.schema, 1)
  assert.deepEqual(generated.ordering!.ranks['p-2'], [0])
  assert.deepEqual(generated.ordering!.ranks['p-10'], [1])
  assert.ok(generated.entries.every((entry) => entry.kind === 'style'))
  assert.deepEqual(
    generated.entries.map((entry) => entry.groups[0]!.priorityRank),
    [1, 0],
  )
})

test('maps supported Node platforms to optional native packages', () => {
  assert.equal(nativePackageName('win32', 'x64'), '@hozo/compiler-win32-x64-msvc')
  assert.equal(nativePackageName('darwin', 'arm64'), '@hozo/compiler-darwin-arm64')
  assert.equal(nativePackageName('linux', 'x64', 'musl'), '@hozo/compiler-linux-x64-musl')
  assert.equal(nativePackageName('freebsd', 'x64'), undefined)
})

test('prefers the adjacent development addon and falls back to the platform package', () => {
  const tried: string[] = []
  const binding = loadNativeBinding<{ compile: string }>({
    localPath: 'local.node',
    platform: 'win32',
    arch: 'x64',
    require(specifier) {
      tried.push(specifier)
      if (specifier === 'local.node') throw new Error('missing')
      return { compile: 'native' }
    },
  })

  assert.deepEqual(tried, ['local.node', '@hozo/compiler-win32-x64-msvc'])
  assert.equal(binding.compile, 'native')
})

test('an explicit override is authoritative and failures are actionable', () => {
  assert.throws(
    () =>
      loadNativeBinding({
        localPath: 'local.node',
        platform: 'darwin',
        arch: 'arm64',
        override: '/custom/hozo.node',
        require() {
          throw new Error('wrong ABI')
        },
      }),
    (error: Error) =>
      error.message.includes('darwin/arm64') &&
      error.message.includes('/custom/hozo.node') &&
      error.message.includes('HOZO_NATIVE_BINDING'),
  )
})
