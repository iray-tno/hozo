import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { lowerModule, prepareLowerModuleStyles } from '@hozo/compiler/lower'
import { emitFinalTailwindBatch } from '@hozo/compiler/project'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const root = process.cwd()
const file = path.join(root, 'WebStyles.tsx')
const css = '@theme {--spacing:.25rem;} @tailwind utilities;'
const prepare = async (names: readonly string[]) =>
  JSON.stringify((await prepareTailwindOrder(css, tailwindPackageDir(), names)).snapshot)
const input = `import {Pressable} from '@hozo/core';import {Canvas} from '@hozo/canvas';
  export const App=()=> <Pressable className="p-4 p-2 focus:bg-[#112233] active:bg-[#223344]">
    <Canvas width={20} height={20}><Canvas.Rect width={10} height={10} className="fill-red-500"/></Canvas>
  </Pressable>`

test('full post-Canvas Web structure is available before preparation; final CSS consumes that exact parse', async () => {
  const compiler = createCompiler()
  const control = lowerModule(input, file, file, compiler, root)
  const nativePrepare = compiler.prepareWebModule.bind(compiler)
  let parses = 0,
    previews = 0,
    emissions = 0,
    disposals = 0
  compiler.compile = () => {
    throw new Error('no ordinary second primitive parse')
  }
  compiler.prepareWebModule = (...args) => {
    parses++
    assert.doesNotMatch(args[0], /className="fill-red-500"/)
    const retained = nativePrepare(...args)
    return {
      candidates: retained.candidates,
      preview() {
        previews++
        return retained.preview()
      },
      emit(context) {
        emissions++
        return retained.emit(context)
      },
      dispose() {
        disposals++
        retained.dispose()
      },
    }
  }
  const continuation = prepareLowerModuleStyles(input, file, file, compiler, root)
  assert.deepEqual(continuation.initial, control)
  assert.equal(parses, 1)
  assert.equal(previews, 1)
  assert.equal(emissions, 0, 'graph discovery precedes consuming IR')
  const result = await emitFinalTailwindBatch({
    expected: [{ id: file, revision: 'one' }],
    collected: [{ id: file, revision: 'one', module: continuation.module }],
    runtime: { expected: [], contributions: [] },
    prepare,
  })
  const final = result.modules[0]!.output!
  assert.equal(final.code, continuation.initial!.code)
  assert.notEqual(final.css, continuation.initial!.css)
  assert.match(final.css, /padding-top: 16px/)
  assert.equal(final.cssPath, continuation.initial!.cssPath)
  assert.deepEqual([parses, previews, emissions, disposals], [1, 1, 1, 1])
  assert.throws(() => continuation.module.emit({} as never), /already/)
})

test('root, secondary, nested text and mixed frontend inputs keep their already-discovered JavaScript', async () => {
  const compiler = createCompiler()
  const sources = [
    `import {Button,Text} from '@hozo/core';export const A=()=> <Button className="p-4 p-2 bg-[#112233] bg-[#223344]"><Text>Text</Text></Button>`,
    `import {Chip} from '@hozo/core';export const A=()=> <Chip onRemove={remove} removeClassName="p-4 p-2 active:p-4">Text</Chip>`,
    `import * as stylex from '@stylexjs/stylex';import {Pressable} from '@hozo/core';const styles=stylex.create({x:{':focus':{backgroundColor:'#112233'}}});export const A=()=> <Pressable {...stylex.props(styles.x)} className="p-4 p-2 active:bg-[#223344]"/>`,
    `import {Text} from '@hozo/core';export const A=()=> <Text className="text-[#112233] text-[#223344]">ルビと文字</Text>`,
    `import {View} from '@hozo/core';export const A=()=> <View className={enabled ? 'p-4 p-2' : 'p-2'}/>`,
  ]
  const continuations = sources.map((source, index) => {
    const id = `${file}?case=${index}`
    const continuation = prepareLowerModuleStyles(source, id, file, compiler, root)
    assert.deepEqual(continuation.initial, lowerModule(source, id, file, compiler, root))
    return { id, revision: 'one', ...continuation }
  })
  const final = await emitFinalTailwindBatch({
    expected: continuations,
    collected: continuations,
    runtime: { expected: [], contributions: [] },
    prepare,
  })
  for (const result of final.modules)
    assert.equal(
      result.output!.code,
      continuations.find((entry) => entry.id === result.id)!.initial!.code,
    )
})

test('speculative preview does not publish duplicate observer edits or diagnostics', async () => {
  const stages: string[] = []
  const continuation = prepareLowerModuleStyles(
    input,
    file,
    file,
    createCompiler(),
    root,
    undefined,
    { observe: (event) => stages.push(event.stage) },
  )
  assert.equal(stages.filter((stage) => stage === 'canvas').length, 1)
  assert.equal(stages.includes('semantic'), false)
  await emitFinalTailwindBatch({
    expected: [{ id: file, revision: 'one' }],
    collected: [{ id: file, revision: 'one', module: continuation.module }],
    runtime: { expected: [], contributions: [] },
    prepare,
  })
  assert.equal(stages.filter((stage) => stage === 'semantic').length, 1)
})

test('changed JavaScript fails closed and consumes the continuation, rather than rewriting a parsed graph', async () => {
  const compiler = createCompiler()
  const original = compiler.prepareWebModule.bind(compiler)
  let disposals = 0
  compiler.prepareWebModule = (...args) => {
    const module = original(...args)
    return {
      candidates: module.candidates,
      preview: () => module.preview(),
      emit(context) {
        const output = module.emit(context)
        output[0]!.jsx += ' changed'
        return output
      },
      dispose() {
        disposals++
        module.dispose()
      },
    }
  }
  const continuation = prepareLowerModuleStyles(input, file, file, compiler, root)
  await assert.rejects(
    emitFinalTailwindBatch({
      expected: [{ id: file, revision: 'one' }],
      collected: [{ id: file, revision: 'one', module: continuation.module }],
      runtime: { expected: [], contributions: [] },
      prepare,
    }),
    /TAILWIND_WEB_STRUCTURE_CHANGED/,
  )
  assert.equal(disposals, 1)
  assert.throws(() => continuation.module.emit({} as never), /already/)
})

test('preview failure and abandoning a continuation release native ownership without final emission', () => {
  const compiler = createCompiler()
  const original = compiler.prepareWebModule.bind(compiler)
  let disposals = 0
  compiler.prepareWebModule = (...args) => {
    const module = original(...args)
    return {
      candidates: module.candidates,
      preview() {
        throw new Error('preview failed')
      },
      emit: (context) => module.emit(context),
      dispose() {
        disposals++
        module.dispose()
      },
    }
  }
  assert.throws(() => prepareLowerModuleStyles(input, file, file, compiler, root), /preview failed/)
  assert.equal(disposals, 1)
  const abandoned = prepareLowerModuleStyles(input, file, file, createCompiler(), root)
  abandoned.module.dispose()
  abandoned.module.dispose()
  assert.throws(() => abandoned.module.emit({} as never), /already/)
  const independent = prepareLowerModuleStyles(
    'export const one=1',
    file,
    file,
    createCompiler(),
    root,
  )
  assert.equal(independent.initial, undefined)
  independent.module.dispose()
})
