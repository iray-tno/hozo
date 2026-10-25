import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createCompiler, type PreparedModule, prepareTailwindContext } from '@hozo/compiler'
import {
  type LoweredModule,
  type LowerModuleStage,
  lowerModule,
  lowerModuleOrPrepare,
  prepareLowerModule,
} from '@hozo/compiler/lower'
import { TailwindCandidateUniverse, TailwindProjectSession } from '@hozo/compiler/project'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const order = async (names: readonly string[]) =>
  JSON.stringify(
    (await prepareTailwindOrder('@import "tailwindcss/theme.css";', base, names)).snapshot,
  )
const root = path.resolve('fixtures/direct'),
  file = path.join(root, 'Row.tsx')
const source = (
  classes = 'p-2',
  text = 'Label',
) => `import {View,Text,Avatar} from '@hozo/core';import {Canvas} from '@hozo/canvas';
const Row=()=> <View className="${classes}"><Text className="font-bold">${text}</Text><Avatar fallbackClassName="font-bold"/>
<Canvas><Canvas.Rect className="fill-red-500"/></Canvas></View>`
const names = ['p-2', 'font-bold', 'fill-red-500']
const universe = new TailwindCandidateUniverse(names)
const cancelled = (code: string) => (error) => error?.code === code

test('ready full lowering emits directly without a JS retained handle, reparse or wait signals', async (t) => {
  const compiler = createCompiler(),
    input = source()
  const expectedStages: LowerModuleStage[] = []
  const expected = lowerModule(input, file, file, compiler, root, undefined, {
    observe: (stage) => expectedStages.push(stage),
  })
  let preparations = 0,
    readyCalls = 0
  const session = new TailwindProjectSession(compiler, async (names) => {
    preparations++
    return order(names)
  })
  const run = async (id = file) => {
    const stages: LowerModuleStage[] = []
    const output = await session.runModule(id, universe, (owner, context) =>
      lowerModuleOrPrepare(input, file, file, owner, root, context, undefined, {
        observe: (stage) => stages.push(stage),
      }),
    )
    assert.deepEqual(stages, expectedStages)
    return output
  }
  assert.deepEqual(await run(), expected)
  const direct = compiler.compileWebOrPrepare.bind(compiler)
  compiler.compileWebOrPrepare = (...args) => {
    readyCalls++
    const result = direct(...args)
    assert.ok(Array.isArray(result), 'the complete parse must not cross NAPI as a retained handle')
    return result
  }
  compiler.prepareWebModule = () => {
    throw new Error('a second ordinary preparation')
  }
  compiler.compile = () => {
    throw new Error('a second ordinary parse')
  }
  compiler.compileNativeModule = () => {
    throw new Error('allow has no residue parse')
  }
  const signal = t.mock.method(AbortSignal, 'any', () => {
    throw new Error('ready call must not wait')
  })
  assert.deepEqual(await run('one'), expected)
  assert.deepEqual(await run('two'), expected)
  assert.equal(readyCalls, 2)
  assert.equal(preparations, 1)
  assert.equal(signal.mock.callCount(), 0)
  session.invalidate()
})

test('a candidate outside the lexical snapshot returns the exact parse for preparation, not partial output', async () => {
  const compiler = createCompiler()
  let preparations = 0
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const session = new TailwindProjectSession(compiler, async (names) => {
    preparations++
    if (names.includes('p-4')) {
      started.resolve()
      await gate.promise
    }
    return order(names)
  })
  await session.runModule('prime', universe, (owner, context) =>
    lowerModuleOrPrepare(source(), file, file, owner, root, context),
  )
  const input = source('p-2 p-4', 'New')
  const expected = lowerModule(input, file, file, compiler, root)
  const direct = compiler.compileWebOrPrepare.bind(compiler)
  let retained: PreparedModule<unknown>,
    attempts = 0
  compiler.compileWebOrPrepare = (...args) => {
    attempts++
    const result = direct(...args)
    assert.equal(Array.isArray(result), false)
    retained = result as PreparedModule<unknown>
    assert.ok(retained.candidates.includes('p-4'))
    return result
  }
  const prepare = compiler.prepareWebModule.bind(compiler)
  compiler.prepareWebModule = () => {
    throw new Error('fallback must reuse, not reparse')
  }
  const pending = session.runModule(file, universe, (owner, context) =>
    lowerModuleOrPrepare(input, file, file, owner, root, context),
  )
  await started.promise
  assert.equal(attempts, 1)
  gate.resolve()
  assert.deepEqual(await pending, expected)
  const complete = prepareTailwindContext(await order([...names, 'p-4']))
  assert.throws(() => retained.emit(complete), /already been emitted or disposed/)
  compiler.prepareWebModule = prepare
  // The old lexical snapshot is not the expanded namespace. It must not
  // receive a superset's ranks merely because this source happens to fit.
  let offered = false
  await session.runModule('old-universe', universe, (owner, context) => {
    assert.equal(context, undefined)
    offered = true
    return lowerModuleOrPrepare(source(), file, file, owner, root, context)
  })
  assert.equal(offered, true)
  assert.equal(preparations, 3)
  session.invalidate()
})

test('not-generated is complete evidence and unknown classes keep their existing output', async () => {
  const compiler = createCompiler(),
    input = source('p-2 notautility')
  const all = new TailwindCandidateUniverse([...names, 'notautility'])
  const expected = lowerModule(input, file, file, compiler, root)
  const session = new TailwindProjectSession(compiler, order)
  const run = () =>
    session.runModule(file, all, (owner, context) =>
      lowerModuleOrPrepare(input, file, file, owner, root, context),
    )
  assert.deepEqual(await run(), expected)
  const direct = compiler.compileWebOrPrepare.bind(compiler)
  let emitted = false
  compiler.compileWebOrPrepare = (...args) => {
    const value = direct(...args)
    assert.ok(Array.isArray(value))
    emitted = true
    return value
  }
  assert.deepEqual(await run(), expected)
  assert.equal(emitted, true)
  session.invalidate()
})

test('a candidate-universe revision is immutable, copied and deduplicated, not a mutable identity cache', () => {
  const input = ['p-4', 'p-2', 'p-4']
  const revision = new TailwindCandidateUniverse(input)
  input.push('p-8')
  assert.deepEqual(revision.candidates, ['p-2', 'p-4'])
  assert.equal(revision.key, '["p-2","p-4"]')
  assert.equal(Object.isFrozen(revision), true)
  assert.equal(Object.isFrozen(revision.candidates), true)
  assert.equal(Reflect.set(revision, 'key', 'wrong'), false)
  assert.throws(() => (revision.candidates as string[]).push('p-8'))
})

test('ready attempts retain supersession and invalidation checks before delivery', async () => {
  for (const mode of ['source', 'project']) {
    const compiler = createCompiler()
    const session = new TailwindProjectSession(compiler, order)
    const run = (text: string) =>
      session.runModule(file, universe, (owner, context) =>
        lowerModuleOrPrepare(source('p-2', text), file, file, owner, root, context),
      )
    await run('Prime')
    let next: Promise<LoweredModule | undefined>
    const pending = session.runModule(file, universe, (owner, context) => {
      const result = lowerModuleOrPrepare(source('p-2', 'Old'), file, file, owner, root, context)
      assert.equal(result.kind, 'complete')
      queueMicrotask(() => {
        if (mode === 'source') next = run('New')
        else session.invalidate()
      })
      return result
    })
    await assert.rejects(
      pending,
      cancelled(mode === 'source' ? 'TAILWIND_MODULE_SUPERSEDED' : 'TAILWIND_PROJECT_INVALIDATED'),
    )
    if (mode === 'source') assert.match((await next)!.code, /New/)
    session.invalidate()
  }
})

test('a prepared owner created by an attempt is disposed even if cancelled before collection', async () => {
  const compiler = createCompiler()
  const session = new TailwindProjectSession(compiler, order)
  let owned: PreparedModule<LoweredModule | undefined>
  const pending = session.runModule(file, universe, (owner) => {
    owned = prepareLowerModule(source(), file, file, owner, root)
    session.invalidate()
    return { kind: 'prepared', module: owned }
  })
  await assert.rejects(pending, cancelled('TAILWIND_PROJECT_INVALIDATED'))
  const context = prepareTailwindContext(await order(names))
  assert.throws(() => owned.emit(context), /already been emitted or disposed/)
})

test('runModule and retained batches share cancellation tickets and in-flight preparation', async () => {
  const compiler = createCompiler()
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  let preparations = 0
  const session = new TailwindProjectSession(compiler, async (names) => {
    preparations++
    started.resolve()
    await gate.promise
    return order(names)
  })
  const first = session.emit(
    file,
    [(owner) => prepareLowerModule(source('p-2', 'Old'), file, file, owner, root)],
    names,
  )
  const rejected = assert.rejects(first, cancelled('TAILWIND_MODULE_SUPERSEDED'))
  await started.promise
  const next = session.runModule(file, universe, (owner, context) =>
    lowerModuleOrPrepare(source('p-2', 'New'), file, file, owner, root, context),
  )
  await rejected
  gate.resolve()
  assert.match((await next)!.code, /New/)
  assert.equal(preparations, 1)
  session.invalidate()
})

test('independent early-return domains avoid project preparation, and failed candidate iteration does not poison the session', async () => {
  const compiler = createCompiler()
  compiler.prepareWebModule = () => {
    throw new Error('unexpected primitive parse')
  }
  const session = new TailwindProjectSession(compiler, () => {
    throw new Error('no project preparation needed')
  })
  const input = `import {Canvas} from '@hozo/canvas';const Row=()=> <Canvas><Canvas.Rect className="fill-red-500"/></Canvas>`
  const expected = lowerModule(input, file, file, createCompiler(), root)
  const broken = {
    *[Symbol.iterator]() {
      yield 'p-2'
      throw new Error('broken candidates')
    },
  }
  await assert.rejects(
    session.runModule(file, broken, () => {
      throw new Error('should not collect')
    }),
    /broken candidates/,
  )
  const output = await session.runModule(file, universe, (owner, context) =>
    lowerModuleOrPrepare(input, file, file, owner, root, context),
  )
  assert.deepEqual(output, expected)
  session.invalidate()
  const closed = new TailwindProjectSession(compiler, order)
  const invalidating = {
    *[Symbol.iterator]() {
      yield 'p-2'
      closed.invalidate()
      yield 'p-4'
    },
  }
  await assert.rejects(
    closed.runModule(file, invalidating, () => {
      throw new Error('must not attempt after invalidation during candidate iteration')
    }),
    cancelled('TAILWIND_PROJECT_INVALIDATED'),
  )
})
