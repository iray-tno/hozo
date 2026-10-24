import { type CompiledComponent, type CompiledNativeModule, createCompiler } from '../src/index.ts'
import { emitTailwindModules } from '../src/tailwind-project.ts'

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
