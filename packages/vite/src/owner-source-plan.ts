// One bounded configured source snapshot, not a second dependency resolver.
import { createHash } from 'node:crypto'
import path from 'node:path'
import { inspectStaticModuleImports } from '@hozo/compiler'
import { readBoundedUtf8File } from '@hozo/compiler/project'
import type { ViteOwnerCandidatePlan } from './owner-candidates.ts'

export function discoverViteOwnerSourcePlan(files: readonly string[]): ViteOwnerCandidatePlan {
  const sources = [...new Set(files.map((file) => path.resolve(file)))].sort()
  if (sources.length > 512) throw new Error('VITE_OWNER_SOURCE_FILE_BUDGET')
  const edges: ViteOwnerCandidatePlan['edges'][number][] = []
  const inputs: { file: string; sha256: string }[] = []
  let bytes = 0
  for (const file of sources) {
    const source = readBoundedUtf8File(file, 4_194_304)
    bytes += Buffer.byteLength(source)
    if (bytes > 33_554_432) throw new Error('VITE_OWNER_SOURCE_BYTE_BUDGET')
    const imports = inspectStaticModuleImports(source, file)
    if (imports.diagnostics.length)
      throw new Error(`VITE_OWNER_SOURCE_UNASSESSED: ${file}: ${imports.diagnostics[0]!.message}`)
    inputs.push({ file, sha256: createHash('sha256').update(source).digest('hex') })
    for (const specifier of imports.requests) edges.push({ importer: file, specifier })
    if (edges.length > 512) throw new Error('VITE_OWNER_SOURCE_EDGE_BUDGET')
  }
  return {
    edges,
    sources: inputs,
    context: createHash('sha256')
      .update(JSON.stringify(['vite-configured-static-sources-0', inputs]))
      .digest('hex'),
  }
}
