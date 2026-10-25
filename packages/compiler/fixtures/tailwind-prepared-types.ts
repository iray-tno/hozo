import { type CompiledComponent, type CompiledNativeModule, createCompiler } from '../src/index.ts'
import { type LoweredModule, prepareLowerModule } from '../src/lower.ts'
import { emitTailwindModules } from '../src/tailwind-project.ts'
import { TailwindProjectSession } from '../src/tailwind-session.ts'

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
