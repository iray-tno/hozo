import { createHash } from 'node:crypto'
import path from 'node:path'
import type { AnalysisPlatform, GraphResolution } from './analysis-stylex.ts'
import type { StylexModuleCache } from './stylex-project.ts'

export const REQUIRED_CONTEXT_POLICY = 'compiler-stylex-reference-context-v1'

/** Static lowering context only; not runtime resolution or a compatibility verdict. */
export interface StylexContextVerdict {
  policy: typeof REQUIRED_CONTEXT_POLICY
  platform: AnalysisPlatform
  sourceSha256: string
  evidence: 'module-import-bindings-and-conservative-references'
  status: 'not-required' | 'complete' | 'unresolved'
  modules: { file: string; sha256: string }[]
  edges: GraphResolution[]
  issues: string[]
}

export type StylexContextAnalyzer = (
  file: string,
  platform: AnalysisPlatform,
  source: string,
) => StylexContextVerdict

export function contextVerdict(
  source: string,
  platform: AnalysisPlatform,
  status: StylexContextVerdict['status'],
  issues: string[] = [],
): StylexContextVerdict {
  return {
    policy: REQUIRED_CONTEXT_POLICY,
    platform,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    evidence: 'module-import-bindings-and-conservative-references',
    status,
    modules: [],
    edges: [],
    issues,
  }
}

/** Index once; subsequent file analyses do not resolve or read the filesystem. */
export function createStylexContextAnalyzer(
  graphs: Record<AnalysisPlatform, StylexModuleCache>,
  resolutions: readonly GraphResolution[],
  authoredFiles: readonly string[],
): StylexContextAnalyzer {
  const edges = new Map(
    resolutions.map((edge) => [
      `${edge.platform}\0${edge.importer}\0${edge.specifier}`,
      { ...edge },
    ]),
  )
  const files = new Set([
    ...authoredFiles,
    ...resolutions.flatMap((edge) => [edge.importer, ...(edge.resolved ? [edge.resolved] : [])]),
  ])
  const snapshots = Object.fromEntries(
    Object.entries(graphs).map(([platform, graph]) => [
      platform,
      new Map(
        [...files].flatMap((file) => {
          const entry = graph.get(file)
          return entry ? [[file, structuredClone(entry)] as const] : []
        }),
      ),
    ]),
  ) as Record<AnalysisPlatform, Map<string, NonNullable<ReturnType<StylexModuleCache['get']>>>>
  // Registry membership is computed once, not by enumerating the whole graph
  // for every dependency of every file/target. Live links and hashes still guard
  // against a cache being mutated after preparation.
  const registered = Object.fromEntries(
    Object.entries(graphs).map(([platform, graph]) => [
      platform,
      new Set(graph.modules().map((entry) => entry.path)),
    ]),
  ) as Record<AnalysisPlatform, Set<string>>
  return (file, platform, source) => {
    const result = contextVerdict(source, platform, 'complete')
    const graph = graphs[platform]
    const root = path.resolve(file)
    if (snapshots[platform].get(root)?.contentHash !== result.sourceSha256) {
      result.status = 'unresolved'
      result.issues.push('Prepared source evidence is missing or differs from the analyzed source.')
      return result
    }
    const visited = new Set<string>()
    const visit = (importer: string) => {
      if (visited.has(importer)) return
      visited.add(importer)
      const entry = snapshots[platform].get(importer)
      if (entry?.contentHash !== graph.get(importer)?.contentHash) {
        result.issues.push(`Prepared graph changed after analysis preparation: ${importer}`)
        return
      }
      if (!entry?.summary.context?.parseComplete) {
        result.issues.push(
          `Reference evidence is missing or parser recovery is incomplete: ${importer}`,
        )
        return
      }
      result.modules.push({ file: importer, sha256: entry.contentHash })
      // Reexports in a reached module remain conservative. Do not guess which
      // named/star edge the compiler could have needed through an ambiguous barrel.
      const requests = new Set([
        ...entry.summary.context.valueImports,
        ...entry.summary.reexports.map(({ specifier }) => specifier),
      ])
      for (const specifier of [...requests].sort()) {
        const edge = edges.get(`${platform}\0${importer}\0${specifier}`) ?? {
          platform,
          importer,
          specifier,
          status: 'unresolved' as const,
          reason: 'No prepared resolution evidence for a possible StyleX value/reexport.',
        }
        result.edges.push({ ...edge })
        if (edge.status !== 'resolved' || !edge.resolved) {
          result.issues.push(`Required static context is unresolved: ${importer} -> ${specifier}`)
        } else if (
          !registered[platform].has(edge.resolved) ||
          graph.resolvedBindingFor(importer, specifier) !== edge.resolved
        ) {
          result.issues.push(
            `Resolved source is not an active registered StyleX binding: ${importer} -> ${specifier}`,
          )
        } else visit(edge.resolved)
      }
    }
    visit(root)
    result.modules.sort((a, b) => a.file.localeCompare(b.file))
    if (result.issues.length) result.status = 'unresolved'
    return result
  }
}
