// One bounded configured source snapshot, not a second dependency resolver.
import { createHash } from 'node:crypto'
import path from 'node:path'
import { inspectStaticModuleImports } from '@hozo/compiler'
import { readBoundedUtf8File } from '@hozo/compiler/project'
import type { ViteOwnerCandidatePlan } from './owner-candidates.ts'
import { ViteOwnerPreflightUnavailable } from './owner-preflight.ts'

/** Physical source inspection only; resolution remains the adapter's job. */
export function inspectViteOwnerSource(file: string) {
  const source = readBoundedUtf8File(file, 4_194_304)
  const imports = inspectStaticModuleImports(source, file)
  if (imports.diagnostics.length)
    throw new Error(`VITE_OWNER_SOURCE_UNASSESSED: ${file}: ${imports.diagnostics[0]!.message}`)
  return {
    file,
    sha256: createHash('sha256').update(source).digest('hex'),
    bytes: Buffer.byteLength(source),
    edges: imports.requests.map((specifier) => ({ importer: file, specifier })),
    bindings: imports.bindings,
  }
}

export function discoverViteOwnerSourcePlan(files: readonly string[]): ViteOwnerCandidatePlan {
  const sources = [...new Set(files.map((file) => path.resolve(file)))].sort()
  const edges: ViteOwnerCandidatePlan['edges'][number][] = []
  const inputs: { file: string; sha256: string }[] = []
  function unavailable(detail: string): never {
    const observed = inputs.map((input) => Object.freeze({ ...input }))
    // File count is refused before inspection; otherwise retain exactly the
    // bounded roots already read, not an invented complete dependency graph.
    throw new ViteOwnerPreflightUnavailable('source-budget', detail, {
      watchFiles: observed.map(({ file }) => file),
      validate() {
        for (const input of observed) {
          const source = readBoundedUtf8File(input.file, 4_194_304)
          if (createHash('sha256').update(source).digest('hex') !== input.sha256)
            throw new Error('Vite owner source snapshot changed')
        }
      },
    })
  }
  if (sources.length > 512) unavailable('VITE_OWNER_SOURCE_FILE_BUDGET')
  let bytes = 0
  for (const file of sources) {
    const input = inspectViteOwnerSource(file)
    bytes += input.bytes
    if (bytes > 33_554_432) throw new Error('VITE_OWNER_SOURCE_BYTE_BUDGET')
    inputs.push({ file, sha256: input.sha256 })
    edges.push(...input.edges)
    if (edges.length > 512) unavailable('VITE_OWNER_SOURCE_EDGE_BUDGET')
  }
  return {
    edges,
    sources: inputs,
    followStaticImports: true,
    context: createHash('sha256')
      .update(JSON.stringify(['vite-configured-static-sources-0', inputs]))
      .digest('hex'),
  }
}

/** No owner parsing here: protect ordinary source facts if root collection
 * itself exceeded the static-analysis budget. Normal hozo() never calls it. */
export function guardViteOwnerFallbackRoots(
  files: readonly string[],
  refusal: ViteOwnerPreflightUnavailable,
): ViteOwnerPreflightUnavailable {
  if (files.length > 4096) throw new Error('VITE_OWNER_FALLBACK_GUARD_FILE_BUDGET')
  let bytes = 0
  const observations = files.map((file) => {
    const source = readBoundedUtf8File(file, 4_194_304)
    bytes += Buffer.byteLength(source)
    if (bytes > 33_554_432) throw new Error('VITE_OWNER_FALLBACK_GUARD_BYTE_BUDGET')
    return { file, sha256: createHash('sha256').update(source).digest('hex') }
  })
  return new ViteOwnerPreflightUnavailable(refusal.reason, refusal.detail, {
    watchFiles: [...new Set([...refusal.watchFiles, ...files])],
    validate() {
      refusal.validate()
      for (const { file, sha256 } of observations) {
        const source = readBoundedUtf8File(file, 4_194_304)
        if (createHash('sha256').update(source).digest('hex') !== sha256)
          throw new Error('Vite owner fallback source snapshot changed')
      }
    },
  })
}
