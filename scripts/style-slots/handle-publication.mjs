// Explicit RFC010 evidence fixture. This is not an adapter or manifest resolver.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '../../packages/compiler/src/index.ts'
import { prepareOwnerLiteralCallers } from '../../packages/compiler/src/owner-caller-plan.ts'
import { emitFinalTailwindBatch } from '../../packages/compiler/src/tailwind-final-batch.ts'
import { prepareTailwindOrder, tailwindPackageDir } from '../../packages/tailwind/src/theme.ts'

export const handleClasses = 'p-4 p-2 w-8 w-4 bg-[#112233] bg-[#223344]'
export const handleSource = `import {BottomSheet} from '@hozo/patterns';
export function App({open=true,detents=[1],author}) {
  return <BottomSheet open={open} detents={detents} handleClassName="${handleClasses}" handleStyle={author}>Body</BottomSheet>
}`
export const handleRoot = fileURLToPath(new URL('../../', import.meta.url))

export async function prepareHandlePublication() {
  const compiler = createCompiler()
  let context
  const prepare = compiler.prepareNativeModule.bind(compiler)
  compiler.prepareNativeModule = (...args) => {
    const module = prepare(...args)
    return {
      candidates: module.candidates,
      emit(current) {
        context = current
        return module.emit(current)
      },
      dispose: () => module.dispose(),
    }
  }
  const owner = prepareOwnerLiteralCallers(handleSource, compiler, {
    source: '@hozo/patterns',
    imported: 'BottomSheet',
    shadow: readFileSync(new URL('./owner-shadow.json', import.meta.url), 'utf8'),
  })
  const opaque = openCandidateCache()
  opaque.scanFile('Opaque.tsx', handleSource, 0)
  const row = { id: 'Opaque.tsx', revision: 'one', record: opaque.exportFile('Opaque.tsx') }
  assert.ok(row.record, 'a positive runtime source fact, never authored scan JSON')
  const batch = await emitFinalTailwindBatch({
    expected: [{ id: 'owner', revision: 'one' }],
    collected: [{ id: 'owner', revision: 'one', module: owner }],
    runtime: { expected: [row], contributions: [row] },
    prepare: async (names) =>
      JSON.stringify(
        (
          await prepareTailwindOrder(
            '@import "tailwindcss/theme.css";',
            tailwindPackageDir(),
            names,
          )
        ).snapshot,
      ),
  })
  const prepared = batch.modules[0].output
  assert.equal(prepared.findings.length, 1)
  assert.equal(prepared.findings[0].disposition, 'prepared-literal')
  assert.equal(prepared.contextFingerprint, batch.fingerprint)
  assert.ok(context)
  // Reconcile this fixture's post-rewrite source explicitly. A production
  // adapter must establish its whole graph/epoch before making this deletion.
  const after = openCandidateCache()
  after.scanFile('Prepared.tsx', prepared.code, 0)
  const derived = after.renderNativeModulePlan(context)
  assert.equal(derived.fingerprint, batch.fingerprint)
  return {
    source: handleSource,
    prepared: prepared.code,
    before: batch.native,
    after: derived,
    fingerprint: batch.fingerprint,
    classes: handleClasses,
  }
}
