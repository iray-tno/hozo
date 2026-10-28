import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, TAILWIND_SCALAR_ORDER_POLICY } from '@hozo/compiler'
import { CACHE_DIR, StylexModuleCache, TailwindProjectSession } from '@hozo/compiler/project'
import { createClassResolver, hozoTextMetricStyles } from '../../engine/src/class-resolver.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { metroStatePath, readMetroState, withHozo } from './config.ts'
import { getCacheKey, transform } from './index.ts'
import { MetroTailwindWorker, readTailwindTransfer } from './tailwind-worker.ts'
import { transformHozoSource } from './transform.ts'

function fixture(t: TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-metro-worker-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(path.join(root, 'src'))
  const entry = path.join(root, 'global.css')
  const tokens = path.join(root, 'tokens.css')
  writeFileSync(entry, '@import "tailwindcss"; @import "./tokens.css";')
  writeFileSync(tokens, '@theme { --color-brand: #123456; --spacing: 7px; }')
  const source = `import {View,Text} from '@hozo/core'; export const A=()=> <View className="p-2"><Text className="text-brand">Hello</Text></View>`
  const file = path.join(root, 'src', 'App.tsx')
  writeFileSync(file, source)
  const upstream = path.join(root, 'upstream.cjs')
  writeFileSync(upstream, 'module.exports = {transform: params => params.src}\n')
  const config = { projectRoot: root, transformer: { babelTransformerPath: upstream } }
  return { root, entry, tokens, file, source, config }
}

test('default static workers and generated dynamic maps share winners across restarts and class orders', async (t) => {
  const { root, tokens, file, config } = fixture(t)
  // A genuine runtime source, separate from static subtraction.
  writeFileSync(
    path.join(root, 'src', 'tones.ts'),
    `export const tone=()=> 'p-4 p-2 focus:p-2 active:p-4'`,
  )
  for (const spacing of [7, 11]) {
    writeFileSync(tokens, `@theme {--spacing:${spacing}px;}`)
    await withHozo(config)
    const code = readFileSync(path.join(root, CACHE_DIR, 'candidates.native.js'), 'utf8')
    const resolve = runInNewContext(
      `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}\nhozoClasses`,
      { createClassResolver, hozoTransformStyles, I18nManager: { isRTL: false } },
    )
    for (const classes of ['p-4 p-2', 'p-2 p-4']) {
      const input = `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
      const compiled = await transform({
        src: input,
        filename: file,
        options: { projectRoot: root, platform: 'android' },
      })
      assert.match(compiled, new RegExp(`paddingTop: ${spacing * 4}\\b`))
      assert.doesNotMatch(compiled, new RegExp(`paddingTop: ${spacing * 2}\\b`))
      assert.equal(Object.assign({}, ...resolve(classes)).paddingTop, spacing * 4)
    }
    const states = Object.assign(
      {},
      ...resolve('active:p-4 focus:p-2', { focused: true, pressed: true }),
    )
    assert.equal(states.paddingTop, spacing * 4)
  }
})

test('the default Metro transform uses the config snapshot after CSS mutation/deletion and on restart', async (t) => {
  const { root, entry, tokens, source, file, config } = fixture(t)
  await withHozo(config)
  const state = readMetroState(root)!
  assert.ok(state.tailwind)
  const firstKey = getCacheKey({ projectRoot: root })
  const transfer = await readTailwindTransfer(state.tailwind)
  assert.ok(transfer.candidates.includes('p-2'), 'static names belong to the ordering seed')
  assert.doesNotMatch(
    readFileSync(path.join(root, CACHE_DIR, 'candidates.native.js'), 'utf8'),
    /"p-2"/,
  )
  const expected = transformHozoSource(
    source,
    file,
    root,
    createCompiler({ ...transfer.snapshot.theme, preflight: true }),
  )
  writeFileSync(tokens, '@theme { --spacing: 13px; --color-brand: #654321; }')
  rmSync(entry)
  const childParams = {
    src: source,
    filename: file,
    options: { projectRoot: root, platform: 'android' },
  }
  const isolated = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {transform} from ${JSON.stringify(new URL('./index.ts', import.meta.url).href)}; process.stdout.write(JSON.stringify(await transform(${JSON.stringify(childParams)})));`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 15000 },
  )
  assert.equal(JSON.parse(isolated), expected, 'a new process knows no parent compiler/theme cache')
  const run = (src: string, platform = 'android') =>
    transform({
      src,
      filename: file,
      options: { projectRoot: root, platform },
    }) as Promise<string>
  assert.equal(await run(source), expected)
  assert.equal(getCacheKey({ projectRoot: root }), firstKey)
  assert.match(await run(source.replace('p-2', 'p-3')), /paddingTop: 21/)
  assert.equal(
    await run(source, 'ios'),
    expected,
    'a fresh platform must restore old captured bytes too',
  )

  writeFileSync(entry, '@import "tailwindcss"; @import "./tokens.css";')
  await withHozo(config)
  assert.notEqual(getCacheKey({ projectRoot: root }), firstKey)
  assert.match(await run(source), /paddingTop: 26/)
  assert.match(await run(source), /#654321/)
  const nextKey = getCacheKey({ projectRoot: root })
  await withHozo(config)
  assert.equal(
    getCacheKey({ projectRoot: root }),
    nextKey,
    'identical config produces a stable epoch',
  )
  await withHozo(config, { preflight: false })
  assert.notEqual(getCacheKey({ projectRoot: root }), nextKey)
})

test('font-weight tokens use the same captured values in static workers and the generated map until restart', async (t) => {
  const { root, config, tokens, file } = fixture(t)
  const input = `import {Text} from '@hozo/core';export const A=()=> <Text className="font-bold"/>`
  writeFileSync(file, input)
  writeFileSync(path.join(root, 'src', 'weight.ts'), `export const weight=()=> 'font-bold'`)
  writeFileSync(tokens, '@theme {--font-weight-bold:900;}')
  await withHozo(config)
  const firstKey = getCacheKey({ projectRoot: root })
  const run = () =>
    transform({ src: input, filename: file, options: { projectRoot: root, platform: 'android' } })
  const dynamic = () => {
    const code = readFileSync(path.join(root, CACHE_DIR, 'candidates.native.js'), 'utf8')
    const resolver = runInNewContext(
      `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\nhozoClasses`,
      { createClassResolver },
    )
    return Object.assign({}, ...resolver('font-bold')).fontWeight
  }
  assert.match(await run(), /fontWeight: '900'/)
  assert.equal(dynamic(), '900')
  writeFileSync(tokens, '@theme {--font-weight-bold:300;}')
  assert.match(await run(), /fontWeight: '900'/)
  assert.equal(dynamic(), '900')
  await withHozo(config)
  assert.notEqual(getCacheKey({ projectRoot: root }), firstKey)
  assert.match(await run(), /fontWeight: '300'/)
  assert.equal(dynamic(), '300')
})

test('default Metro static output and generated metric composition agree without an opt-in flag', async (t) => {
  const { root, config, tokens, file } = fixture(t)
  const classes = 'text-lg text-xl leading-6 p-4 p-2'
  writeFileSync(
    file,
    `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}"/>`,
  )
  writeFileSync(path.join(root, 'src', 'metrics.ts'), `export const metrics=()=> '${classes}'`)
  writeFileSync(tokens, '@theme {--spacing:.25rem;}')
  await withHozo(config)
  const code = readFileSync(path.join(root, CACHE_DIR, 'candidates.native.js'), 'utf8')
  assert.match(code, /hozoTextMetricStyles/)
  const resolver = runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\nhozoClasses`,
    { createClassResolver, hozoTextMetricStyles },
  )
  for (const value of [classes, classes.split(' ').reverse().join(' ')]) {
    const output = await transform({
      src: `import {Text} from '@hozo/core';export const A=()=> <Text className="${value}"/>`,
      filename: file,
      options: { projectRoot: root, platform: 'android' },
    })
    assert.match(output, /fontSize: 20/)
    assert.match(output, /lineHeight: 24/)
    const dynamic = Object.assign({}, ...resolver(value))
    assert.equal(dynamic.fontSize, 20)
    assert.equal(dynamic.lineHeight, 24)
    assert.equal(dynamic.paddingTop, 16)
  }
})

test('full lexical startup names give one retained parse followed by ready hits without ordinary lowering', async (t) => {
  const { root, source, config } = fixture(t)
  await withHozo(config)
  const transfer = await readTailwindTransfer(readMetroState(root)!.tailwind!)
  const compiler = createCompiler({ ...transfer.snapshot.theme, preflight: true })
  const expected = transformHozoSource(source, 'One.tsx', root, compiler)
  let retained = 0
  let ready = 0
  const prepare = compiler.prepareNativeModule.bind(compiler)
  const attempt = compiler.compileNativeOrPrepare.bind(compiler)
  compiler.compileNativeModule = () => {
    throw new Error('ordinary parse must not run')
  }
  compiler.setTailwindOrder = () => {
    throw new Error('no global context')
  }
  compiler.prepareNativeModule = (...args) => {
    retained++
    return prepare(...args)
  }
  compiler.compileNativeOrPrepare = (...args) => {
    ready++
    return attempt(...args)
  }
  const worker = new MetroTailwindWorker(compiler, transfer)
  t.after(() => worker.invalidate())
  for (let index = 0; index < 20; index++) {
    assert.equal(await worker.transform(source, `Source${index}.tsx`, root), expected)
  }
  assert.equal(retained, 1)
  assert.equal(ready, 19)
  // A class absent from the startup walk uses that actual retained parse,
  // expands the next namespace, and becomes ready without a second parse.
  assert.match(
    (await worker.transform(source.replace('p-2', 'p-123'), 'New.tsx', root))!,
    /paddingTop: 861/,
  )
  const afterMiss = retained
  await worker.transform(source.replace('p-2', 'p-123'), 'NewAgain.tsx', root)
  assert.equal(retained, afterMiss)
})

test('simultaneous platforms keep their own resolver-verified StyleX modules through preparation', async (t) => {
  const { root, config } = fixture(t)
  const file = path.join(root, 'src', 'Styled.tsx')
  const android = path.join(root, 'src', 'styles.android.ts')
  const ios = path.join(root, 'src', 'styles.ios.ts')
  for (const [file, margin] of [
    [android, 37],
    [ios, 41],
  ] as const) {
    writeFileSync(
      file,
      `import * as stylex from '@stylexjs/stylex'; export const styles=stylex.create({root:{marginTop:${margin}}});`,
    )
  }
  const source = `import * as stylex from '@stylexjs/stylex'; import {View} from '@hozo/core'; import {styles} from '@theme'; export const A=()=> <View {...stylex.props(styles.root)} className="p-2"/>`
  writeFileSync(file, source)
  const result = await withHozo({
    ...config,
    resolver: {
      resolveRequest(
        context: { resolveRequest: (...args: unknown[]) => unknown },
        name: string,
        platform: string | null,
      ) {
        if (name === '@theme')
          return { type: 'sourceFile', filePath: platform === 'ios' ? ios : android }
        return context.resolveRequest(context, name, platform) as {
          type: string
          filePath?: string
        }
      },
    },
  })
  const context = {
    originModulePath: file,
    resolveRequest: () => ({ type: 'sourceFile', filePath: file }),
  }
  result.resolver.resolveRequest(context, './Styled', 'ios')
  result.resolver.resolveRequest(context, './Styled', 'android')
  const outputs = await Promise.all(
    ['ios', 'android'].map((platform) =>
      transform({
        src: source,
        filename: file,
        options: { projectRoot: root, platform },
      }),
    ),
  )
  assert.match(outputs[0] as string, /marginTop: 41/)
  assert.match(outputs[1] as string, /marginTop: 37/)
  assert.ok(new StylexModuleCache(path.join(root, CACHE_DIR, 'stylex-modules.json')).get(ios))
})

test('a superseded source and a retired worker cannot deliver late prepared output', async (t) => {
  const { root, source, config } = fixture(t)
  await withHozo(config)
  const transfer = await readTailwindTransfer(readMetroState(root)!.tailwind!)
  let release!: () => void
  let enter!: () => void
  const entered = new Promise<void>((resolve) => {
    enter = resolve
  })
  const paused = new Promise<void>((resolve) => {
    release = resolve
  })
  const worker = new MetroTailwindWorker(createCompiler(transfer.snapshot.theme), {
    ...transfer,
    snapshot: {
      ...transfer.snapshot,
      prepareOrder: async (...args) => {
        enter()
        await paused
        return transfer.snapshot.prepareOrder(...args)
      },
    },
  })
  t.after(() => worker.invalidate())
  const first = worker.transform(source, 'Same.tsx', root)
  const firstRejected = assert.rejects(first, { code: 'TAILWIND_MODULE_SUPERSEDED' })
  await entered
  const second = worker.transform(source.replace('Hello', 'New'), 'Same.tsx', root)
  const secondRejected = assert.rejects(second, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  worker.invalidate()
  release()
  await firstRejected
  await secondRejected
})

test('a damaged transferred snapshot fails loudly rather than mixing a fresh theme with old candidates', async (t) => {
  const { root, config, source, file } = fixture(t)
  await withHozo(config)
  const reference = readMetroState(root)!.tailwind!
  writeFileSync(reference.file, '{}')
  await assert.rejects(
    transform({ src: source, filename: file, options: { projectRoot: root, platform: 'android' } }),
    /hash mismatch/,
  )
  writeFileSync(metroStatePath(root), '{')
  await assert.rejects(
    transform({ src: source, filename: file, options: { projectRoot: root } }),
    /Cannot read Metro project state/,
  )
})

test('a validly hashed old projection policy is rejected, not mixed with current generated output', async (t) => {
  const { root, config } = fixture(t)
  await withHozo(config)
  const reference = readMetroState(root)!.tailwind!
  const data = JSON.parse(readFileSync(reference.file, 'utf8'))
  assert.equal(data.orderingPolicy, TAILWIND_SCALAR_ORDER_POLICY)
  data.orderingPolicy = 'scalar-order-v6'
  const content = JSON.stringify(data)
  writeFileSync(reference.file, content)
  await assert.rejects(
    readTailwindTransfer({
      file: reference.file,
      sha256: createHash('sha256').update(content).digest('hex'),
    }),
    /Invalid Metro Tailwind snapshot/,
  )
})

test('config changes after emission still reject old delivery and do not discard the replacement epoch', async (t) => {
  const { root, tokens, file, config, source } = fixture(t)
  await withHozo(config)
  let enter!: () => void
  let release!: () => void
  const emitted = new Promise<void>((resolve) => {
    enter = resolve
  })
  const paused = new Promise<void>((resolve) => {
    release = resolve
  })
  const runModule = TailwindProjectSession.prototype.runModule
  let first = true
  t.mock.method(TailwindProjectSession.prototype, 'runModule', async function (...args) {
    const result = await runModule.apply(this, args)
    if (first) {
      first = false
      enter()
      await paused
    }
    return result
  })
  const params = { src: source, filename: file, options: { projectRoot: root, platform: 'ios' } }
  const stale = transform(params)
  const rejected = assert.rejects(stale, { code: 'TAILWIND_PROJECT_INVALIDATED' })
  await emitted
  writeFileSync(tokens, '@theme { --spacing: 11px; }')
  await withHozo(config)
  assert.match((await transform(params)) as string, /paddingTop: 22/)
  release()
  await rejected
  assert.match((await transform(params)) as string, /paddingTop: 22/)
})
