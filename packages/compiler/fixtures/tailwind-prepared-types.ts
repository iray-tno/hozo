import {
  type CompiledComponent,
  type CompiledNativeModule,
  createCompiler,
  type PreparedTailwindContext,
} from '../src/index.ts'
import { type LoweredModule, lowerModuleOrPrepare, prepareLowerModule } from '../src/lower.ts'
import { emitFinalTailwindBatch, type FinalTailwindBatch } from '../src/tailwind-final-batch.ts'
import { emitTailwindModules } from '../src/tailwind-project.ts'
import { TailwindCandidateUniverse, TailwindProjectSession } from '../src/tailwind-session.ts'

const compiler = createCompiler()
const web = compiler.prepareWebModule('')
const native = compiler.prepareNativeModule('')
const prepare = async () => ''
const webOnly: Promise<CompiledComponent[][]> = emitTailwindModules([web], prepare)
const nativeOnly: Promise<CompiledNativeModule[]> = emitTailwindModules([native], prepare)
const mixed: Promise<(CompiledComponent[] | CompiledNativeModule)[]> = emitTailwindModules(
  [web, native],
  prepare,
)
// @ts-expect-error A mixed platform batch is not a Web-only result.
const invalidResult: Promise<CompiledComponent[][]> = emitTailwindModules([web, native], prepare)
// @ts-expect-error Contexts are validated native handles, not arbitrary objects.
web.emit({ fingerprint: 'not-a-context' })
// @ts-expect-error Decoding belongs before emission, once per batch.
native.emit('{}')
void [webOnly, nativeOnly, mixed, invalidResult]

const session = new TailwindProjectSession(compiler, prepare)
const mixedSession: Promise<(CompiledComponent[] | CompiledNativeModule)[]> = session.emit('file', [
  (compiler) => compiler.prepareWebModule(''),
  (compiler) => compiler.prepareNativeModule(''),
])
// @ts-expect-error Collection is synchronous; asynchronous work belongs in preparation.
session.emit('bad', [async (compiler) => compiler.prepareWebModule('')])
// @ts-expect-error Mixed platform results are not a Native-only result.
const invalidSession: Promise<CompiledNativeModule[]> = mixedSession
void invalidSession
const lowered: Promise<(LoweredModule | undefined)[]> = session.emit('module', [
  (owner) => prepareLowerModule('', 'empty.tsx', 'empty.tsx', owner, ''),
])
// @ts-expect-error A full lowering result is not a primitive component array.
const notComponents: Promise<CompiledComponent[][]> = lowered
void notComponents
const ready: Promise<LoweredModule | undefined> = session.runModule(
  'one',
  new TailwindCandidateUniverse([]),
  (owner, context) => lowerModuleOrPrepare('', 'empty.tsx', 'empty.tsx', owner, '', context),
)
// @ts-expect-error Attempts are synchronous; only preparation may await.
session.runModule('bad', [], async () => ({ kind: 'complete', output: undefined }))
// @ts-expect-error A single full module is not a list of primitive components.
const notPrimitives: Promise<CompiledComponent[]> = ready
void notPrimitives
declare const nativeContext: PreparedTailwindContext
const nativeAttempt = compiler.compileNativeOrPrepare('', nativeContext)
if ('components' in nativeAttempt) {
  const module: CompiledNativeModule = nativeAttempt
  void module
} else {
  const candidates: readonly string[] = nativeAttempt.candidates
  void candidates
}
// @ts-expect-error A ready context is a validated native handle, not JSON.
compiler.compileNativeOrPrepare('', '{}')

const finalWeb: Promise<FinalTailwindBatch<CompiledComponent[]>> = emitFinalTailwindBatch({
  expected: [{ id: 'web', revision: 'one' }],
  collected: [{ id: 'web', revision: 'one', module: web }],
  runtime: { expected: [], contributions: [] },
  prepare,
})
const finalMixed = emitFinalTailwindBatch({
  expected: [
    { id: 'web', revision: 'one' },
    { id: 'native', revision: 'one' },
  ],
  collected: [
    { id: 'web', revision: 'one', module: web },
    { id: 'native', revision: 'one', module: native },
  ],
  runtime: { expected: [], contributions: [] },
  prepare,
})
const finalUnion: Promise<FinalTailwindBatch<CompiledComponent[] | CompiledNativeModule>> =
  finalMixed
// @ts-expect-error A mixed final publication is not a Web-only result.
const invalidFinal: Promise<FinalTailwindBatch<CompiledComponent[]>> = finalMixed
void [finalWeb, finalUnion, invalidFinal]
