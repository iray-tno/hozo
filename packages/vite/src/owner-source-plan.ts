// One bounded configured source snapshot, not a second dependency resolver.
import { createHash } from 'node:crypto'
import path from 'node:path'
import { inspectStaticModuleImports } from '@hozo/compiler'
import { readBoundedUtf8File } from '@hozo/compiler/project'
import type { ViteOwnerCandidatePlan } from './owner-candidates.ts'

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
  if (sources.length > 512) throw new Error('VITE_OWNER_SOURCE_FILE_BUDGET')
  const edges: ViteOwnerCandidatePlan['edges'][number][] = []
  const inputs: { file: string; sha256: string }[] = []
  let bytes = 0
  for (const file of sources) {
    const input = inspectViteOwnerSource(file)
    bytes += input.bytes
    if (bytes > 33_554_432) throw new Error('VITE_OWNER_SOURCE_BYTE_BUDGET')
    inputs.push({ file, sha256: input.sha256 })
    edges.push(...input.edges)
    if (edges.length > 512) throw new Error('VITE_OWNER_SOURCE_EDGE_BUDGET')
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
