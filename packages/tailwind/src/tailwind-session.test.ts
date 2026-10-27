import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { type Compiler, createCompiler, prepareTailwindContext } from '@hozo/compiler'
import { emitTailwindModules, TailwindProjectSession } from '@hozo/compiler/project'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const order = async (names: readonly string[]) =>
  JSON.stringify((await prepareTailwindOrder(css, base, names)).snapshot)
const source = (classes: string, id = 'value') =>
  `import {View} from '@hozo/core';const el=<View className="${classes}" testID="${id}"/>`
const options = { tailwindPlan: true }
const strip = (outputs) => outputs.map(({ tailwindPlan: _plan, ...output }) => output)
const collected = (classes: string, id?: string) => (compiler) =>
  compiler.prepareWebModule(source(classes, id), undefined, options)
const code = (value: string) => (error) => error?.code === value

test('ordinary project sessions enable shared scalar winners without changing standalone pass-through calls', async () => {
  const compiler = createCompiler()
  const session = new TailwindProjectSession(compiler, order)
  try {
    for (const classes of ['p-4 p-2', 'p-2 p-4']) {
      const [web] = await session.emit(`web-${classes}`, [collected(classes)])
      assert.match(web[0].css, /padding-top: 16px/)
      assert.equal(web[0].tailwindPlan.mode, 'scalar-order-v3')
      assert.match(web[0].tailwindPlan.fingerprint, /^scalar-order-v3:/)
      const [native] = await session.emit(`native-${classes}`, [
        (compiler) => compiler.prepareNativeModule(source(classes)),
      ])
      assert.match(native.components[0].styles, /paddingTop: 16/)
      assert.doesNotMatch(native.components[0].styles, /paddingTop: 8/)
    }
    assert.match(compiler.compile(source('p-4 p-2'))[0].css, /padding-top: 8px/)
  } finally {
    session.invalidate()
  }
})

test('same exact universe shares in-flight and ready contexts without re-installing compiler state', async () => {
  const compiler = createCompiler()
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  let calls = 0
  const session = new TailwindProjectSession(compiler, async (names, signal) => {
    calls++
    assert.ok(Object.isFrozen(names))
    assert.equal(signal.aborted, false)
    started.resolve()
    await gate.promise
    return order(names)
  })
  const expected = compiler.compile(source('p-2'))
  compiler.setTailwindOrder = () => {
    throw new Error('session must not install mutable context')
  }
  const first = session.emit('one', [collected('p-2')], ['p-4', 'notautility'])
  const second = session.emit('two', [collected('p-2')], ['notautility', 'p-4', 'p-2'])
  await started.promise
  assert.equal(calls, 1)
  gate.resolve()
  const [a, b] = await Promise.all([first, second])
  const [c] = await session.emit('three', [collected('p-2')], ['p-4', 'notautility'])
  assert.equal(calls, 1)
  for (const output of [a[0], b[0], c]) assert.deepEqual(strip(output), expected)
  assert.equal(a[0][0].tailwindPlan.fingerprint, b[0][0].tailwindPlan.fingerprint)
  assert.equal(c[0].tailwindPlan.fingerprint, a[0][0].tailwindPlan.fingerprint)
  assert.equal(compiler.inspectTailwindOrder(source('p-2')).fingerprint, undefined)
  session.invalidate()
})

test('distinct universes prepare serially, do not reuse subset ranks, and evict old ready contexts', async () => {
  let active = 0,
    maximum = 0,
    calls = 0
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  const session = new TailwindProjectSession(createCompiler(), async (names) => {
    active++
    maximum = Math.max(maximum, active)
    calls++
    try {
      if (calls === 1) {
        started.resolve()
        await gate.promise
      }
      return await order(names)
    } finally {
      active--
    }
  })
  const a = session.emit('one', [collected('p-2')])
  await started.promise
  const b = session.emit('two', [collected('p-2')], ['p-4'])
  assert.equal(calls, 1)
  gate.resolve()
  const [first, second] = await Promise.all([a, b])
  assert.equal(maximum, 1)
  assert.equal(calls, 2)
  assert.notEqual(first[0][0].tailwindPlan.fingerprint, second[0][0].tailwindPlan.fingerprint)
  const third = await session.emit('three', [collected('p-2')])
  assert.equal(calls, 3, 'only the last ready universe is retained')
  assert.equal(third[0][0].tailwindPlan.fingerprint, first[0][0].tailwindPlan.fingerprint)
  session.invalidate()
})

test('a validated context is shared across actual Native and Web emissions without changing their results', async () => {
  const compiler = createCompiler()
  let calls = 0
  const session = new TailwindProjectSession(compiler, async (names) => {
    calls++
    return order(names)
  })
  const input = source('p-2')
  const expected = compiler.compileNativeModule(input)
  for (const id of ['native-a', 'native-b']) {
    const [output] = await session.emit(id, [(compiler) => compiler.prepareNativeModule(input)])
    assert.deepEqual(output, expected)
  }
  const [web] = await session.emit('web', [(compiler) => compiler.prepareWebModule(input)])
  assert.deepEqual(web, compiler.compile(input))
  assert.equal(calls, 1)
  session.invalidate()
})

test('ready contexts need no pending-wait signals and still check supersession before delivery', async (t) => {
  const session = new TailwindProjectSession(createCompiler(), order)
  const universe = ['p-2', 'p-4']
  await session.emit('prime', [collected('p-2')], universe)
  const combine = t.mock.method(AbortSignal, 'any', () => {
    throw new Error('a ready context must not build a pending-wait signal')
  })
  const expected = createCompiler().compile(source('p-2'))
  const [warm] = await session.emit('warm', [collected('p-2')], universe)
  assert.deepEqual(strip(warm), expected)
  let latest: Promise<unknown[]>
  const old = session.emit(
    'file',
    [
      (compiler) => {
        const prepared = compiler.prepareWebModule(source('p-2', 'old'))
        return {
          ...prepared,
          emit(context) {
            const output = prepared.emit(context)
            queueMicrotask(() => {
              latest = session.emit('file', [collected('p-4', 'new')], universe)
            })
            return output
          },
        }
      },
    ],
    universe,
  )
  await assert.rejects(old, code('TAILWIND_MODULE_SUPERSEDED'))
  assert.match(JSON.stringify(await latest!), /new/)
  assert.equal(combine.mock.callCount(), 0)
  session.invalidate()
})

test('superseding the same module releases old IR but can keep a shared preparation alive', async () => {
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>()
  let calls = 0,
    preparationSignal: AbortSignal | undefined,
    old: ReturnType<Compiler['prepareWebModule']>
  const session = new TailwindProjectSession(createCompiler(), async (names, signal) => {
    calls++
    preparationSignal = signal
    started.resolve()
    await gate.promise
    return order(names)
  })
  const first = session.emit('file', [
    (compiler) => {
      old = compiler.prepareWebModule(source('p-2', 'old'))
      return old
    },
  ])
  const rejected = assert.rejects(first, code('TAILWIND_MODULE_SUPERSEDED'))
  await started.promise
  const next = session.emit('file', [collected('p-2', 'new')])
  await rejected
  assert.equal(
    preparationSignal!.aborted,
    false,
    'request cancellation is not project cancellation',
  )
  const context = prepareTailwindContext(await order(['p-2']))
  assert.throws(() => old.emit(context), /already been emitted or disposed/)
  gate.resolve()
  const [output] = await next
  assert.equal(calls, 1)
  assert.match(output[0].jsx, /new/)
  assert.doesNotMatch(output[0].jsx, /old/)
  session.invalidate()
})

test('a ready result is still rejected when its project closes before delivery', async () => {
  const session = new TailwindProjectSession(createCompiler(), order)
  await session.emit('prime', [collected('p-2')])
  const pending = session.emit('file', [
    (compiler) => {
      const prepared = compiler.prepareWebModule(source('p-2'))
      return {
        ...prepared,
        emit(context) {
          const output = prepared.emit(context)
          queueMicrotask(() => session.invalidate())
          return output
        },
      }
    },
  ])
  await assert.rejects(pending, code('TAILWIND_PROJECT_INVALIDATED'))
})

test('obsolete queued universes are skipped and old cleanup cannot erase a newer request ticket', async () => {
  const firstGate = Promise.withResolvers<void>(),
    firstStarted = Promise.withResolvers<void>()
  const middleGate = Promise.withResolvers<void>(),
    middleStarted = Promise.withResolvers<void>()
  const prepared: string[] = []
  const session = new TailwindProjectSession(createCompiler(), async (names) => {
    prepared.push(names.join(' '))
    if (names.includes('font-bold')) {
      firstStarted.resolve()
      await firstGate.promise
    }
    if (names.includes('p-4')) {
      middleStarted.resolve()
      await middleGate.promise
    }
    return order(names)
  })
  const block = session.emit('block', [collected('font-bold')])
  await firstStarted.promise
  const old = session.emit('file', [collected('p-2', 'old')])
  const oldRejected = assert.rejects(old, code('TAILWIND_MODULE_SUPERSEDED'))
  const middle = session.emit('file', [collected('p-4', 'middle')])
  const middleRejected = assert.rejects(middle, code('TAILWIND_MODULE_SUPERSEDED'))
  await oldRejected
  firstGate.resolve()
  await middleStarted.promise
  const latest = session.emit('file', [collected('p-8', 'latest')])
  await middleRejected
  middleGate.resolve()
  const [, result] = await Promise.all([block, latest])
  assert.deepEqual(prepared, ['font-bold', 'p-4', 'p-8'])
  assert.match(result[0][0].jsx, /latest/)
  session.invalidate()
})

test('supersession after synchronous emission still rejects an undelivered result', async () => {
  const session = new TailwindProjectSession(createCompiler(), order)
  let latest: Promise<unknown[]>
  const first = session.emit('file', [
    (compiler) => {
      const prepared = compiler.prepareWebModule(source('p-2', 'old'))
      return {
        ...prepared,
        emit(context) {
          const output = prepared.emit(context)
          // A watcher can run between emission and the async API returning.
          queueMicrotask(() => {
            latest = session.emit('file', [collected('p-4', 'new')])
          })
          return output
        },
      }
    },
  ])
  await assert.rejects(first, code('TAILWIND_MODULE_SUPERSEDED'))
  assert.match(JSON.stringify(await latest!), /new/)
  session.invalidate()
})

test('project invalidation releases pending IR immediately and late invalid data cannot revive it', async () => {
  const gate = Promise.withResolvers<void>(),
    started = Promise.withResolvers<void>(),
    finished = Promise.withResolvers<void>()
  let retained: ReturnType<Compiler['prepareNativeModule']>,
    collections = 0
  const session = new TailwindProjectSession(createCompiler(), async (_names, signal) => {
    started.resolve()
    await gate.promise
    assert.equal(signal.aborted, true)
    finished.resolve()
    return '{'
  })
  const pending = session.emit('file', [
    (compiler) => {
      collections++
      retained = compiler.prepareNativeModule(source('p-2'))
      return retained
    },
  ])
  const rejected = assert.rejects(pending, code('TAILWIND_PROJECT_INVALIDATED'))
  await started.promise
  session.invalidate()
  session.invalidate()
  await rejected
  const context = prepareTailwindContext(await order(['p-2']))
  assert.throws(() => retained.emit(context), /already been emitted or disposed/)
  await assert.rejects(
    session.emit('next', [
      (compiler) => {
        collections++
        return compiler.prepareWebModule(source('p-4'))
      },
    ]),
    code('TAILWIND_PROJECT_INVALIDATED'),
  )
  assert.equal(collections, 1)
  const fresh = new TailwindProjectSession(createCompiler(), order)
  assert.ok((await fresh.emit('file', [collected('p-4')]))[0].length)
  fresh.invalidate()
  gate.resolve()
  await finished.promise
})

test('failed or incomplete preparation does not poison the serial queue or an existing valid cache', async () => {
  let calls = 0,
    fail = true
  const session = new TailwindProjectSession(createCompiler(), async (names) => {
    calls++
    if (names.includes('p-4') && fail) return order([])
    return order(names)
  })
  const [a] = await session.emit('a', [collected('p-2')])
  await assert.rejects(session.emit('b', [collected('p-4')]), /did not collect p-4/)
  const [cached] = await session.emit('a-again', [collected('p-2')])
  assert.equal(calls, 2)
  assert.equal(cached[0].tailwindPlan.fingerprint, a[0].tailwindPlan.fingerprint)
  fail = false
  assert.ok((await session.emit('b-again', [collected('p-4')]))[0].length)
  assert.equal(calls, 3)
  session.invalidate()
})

test('collector failure and throwing extra-candidate iterators dispose the IR they own', async () => {
  const context = prepareTailwindContext(await order(['p-2']))
  const compiler = createCompiler()
  let retained: ReturnType<Compiler['prepareWebModule']>,
    prepares = 0
  const session = new TailwindProjectSession(compiler, async (names) => {
    prepares++
    return order(names)
  })
  await assert.rejects(
    session.emit('partial', [
      (compiler) => {
        retained = compiler.prepareWebModule(source('p-2'))
        return retained
      },
      () => {
        throw new Error('collector failed')
      },
    ]),
    /collector failed/,
  )
  assert.throws(() => retained.emit(context), /already been emitted or disposed/)
  assert.equal(prepares, 0)
  const broken = {
    *[Symbol.iterator]() {
      yield 'p-2'
      throw new Error('candidate iterator failed')
    },
  }
  const a = compiler.prepareWebModule(source('p-2')),
    b = compiler.prepareWebModule(source('p-2'))
  await assert.rejects(emitTailwindModules([a, b], order, broken), /candidate iterator failed/)
  for (const module of [a, b])
    assert.throws(() => module.emit(context), /already been emitted or disposed/)
  session.invalidate()
})

test('imported stylesheet edits get a new namespace and matching theme through explicit epoch replacement', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-session-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const entry = path.join(root, 'app.css'),
    tokens = path.join(root, 'tokens.css')
  const input = '@import "./tokens.css";'
  writeFileSync(entry, input)
  writeFileSync(tokens, '@theme { --spacing: 0.25rem; }')
  const watched = new Set<string>()
  const make = async () =>
    new TailwindProjectSession(
      createCompiler(await loadTheme(input, root, { staticOnly: true, file: entry })),
      async (names) =>
        JSON.stringify(
          (
            await prepareTailwindOrder(input, root, names, {
              file: entry,
              onStylesheet: (file) => watched.add(file),
            })
          ).snapshot,
        ),
    )
  const old = await make()
  const [a] = await old.emit('file', [collected('p-2')])
  assert.match(a[0].css, /padding-top: 8px/)
  assert.ok(watched.has(tokens), 'the real imported dependency is observed by the loader')
  writeFileSync(tokens, '@theme { --spacing: 0.5rem; }')
  old.invalidate()
  const current = await make()
  const [b] = await current.emit('file', [collected('p-2')])
  assert.match(b[0].css, /padding-top: 16px/)
  assert.notEqual(a[0].tailwindPlan.fingerprint, b[0].tailwindPlan.fingerprint)
  current.invalidate()
})
