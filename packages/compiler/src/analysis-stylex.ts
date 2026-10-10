import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CONFIGURATION_RESOLUTION_POLICY, readAnalysisAliases } from './analysis-config.ts'
import { sourcePlatform } from './analysis-sources.ts'
import { StylexModuleCache } from './stylex-project.ts'

export type AnalysisPlatform = 'web' | 'ios' | 'android'
export interface GraphResolution {
  platform: AnalysisPlatform
  importer: string
  specifier: string
  status: 'resolved' | 'unresolved'
  resolved?: string
  reason?: string
}

export function prepareAnalysisStylex(
  root: string,
  authored: readonly { file: string; source: string }[],
  candidates: readonly string[],
) {
  const alias = readAnalysisAliases(root)
  const admitted = new Set(candidates)
  const snapshots = new Map(authored.map((entry) => [entry.file, entry.source]))
  const contexts = new Map<string, string>()
  const resolutions: GraphResolution[] = []
  const graphs = {} as Record<AnalysisPlatform, StylexModuleCache>
  const extensions = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs']
  for (const platform of ['web', 'ios', 'android'] as const) {
    const graph = new StylexModuleCache(undefined, { resolverOnly: true })
    graphs[platform] = graph
    const compatible = (file: string) => {
      if (platform === 'web') return sourcePlatform(file) !== 'native'
      return (
        sourcePlatform(file) !== 'web' &&
        !new RegExp(`\\.${platform === 'ios' ? 'android' : 'ios'}\\.[^.]+$`).test(file)
      )
    }
    const scanned = new Set<string>()
    const scan = (file: string) => {
      if (scanned.has(file) || !compatible(file)) return
      const source = snapshots.get(file) ?? contexts.get(file) ?? readFileSync(file, 'utf8')
      if (!snapshots.has(file)) contexts.set(file, source)
      graph.scanFile(file, source, 0)
      scanned.add(file)
    }
    for (const { file } of authored) scan(file)
    // A project without a StyleX definition or consumer needs no StyleX
    // resolver verdict on thousands of unrelated application reexports.
    if (!authored.some(({ source }) => source.includes('@stylexjs/stylex'))) continue
    const resolve = (specifier: string, importer: string): string | undefined => {
      let bases: string[] = []
      if (specifier.startsWith('.')) bases = [path.resolve(path.dirname(importer), specifier)]
      else if (alias.fact.status === 'resolved') {
        const settings = alias.fact.value
        const keys = Object.keys(settings.paths)
          .filter((key) => {
            const [prefix, suffix] = key.split('*')
            return suffix === undefined
              ? key === specifier
              : specifier.startsWith(prefix!) &&
                  specifier.endsWith(suffix) &&
                  specifier.length >= prefix!.length + suffix.length
          })
          .sort(
            (a, b) =>
              Number(b === specifier) - Number(a === specifier) ||
              b.indexOf('*') - a.indexOf('*') ||
              b.length - a.length,
          )
        const key = keys[0]
        if (key) {
          const [prefix, suffix] = key.split('*')
          const capture =
            suffix === undefined
              ? ''
              : specifier.slice(prefix!.length, suffix ? -suffix.length : undefined)
          bases = settings.paths[key]!.map((value) => value.replace('*', capture))
        }
      }
      for (const base of bases) {
        // Explicit filenames are exact; ESM .js spelling may refer to TS.
        if (extensions.includes(path.extname(base))) {
          if (admitted.has(base) && compatible(base)) return base
          const stem = base.slice(0, -path.extname(base).length)
          if (base.endsWith('.js'))
            for (const ext of ['.ts', '.tsx']) {
              if (admitted.has(stem + ext) && compatible(stem + ext)) return stem + ext
            }
          continue
        }
        const suffixes = platform === 'web' ? ['.web', ''] : [`.${platform}`, '.native', '']
        for (const stem of [base, path.join(base, 'index')]) {
          for (const suffix of suffixes) {
            const matches = extensions
              .map((ext) => stem + suffix + ext)
              .filter((file) => admitted.has(file) && compatible(file))
            // Different bundlers order extensions differently. Do not certify
            // whichever definition happens to come first in this tool's list.
            if (matches.length > 1) return undefined
            if (matches.length === 1) return matches[0]
          }
        }
      }
      return undefined
    }
    const done = new Set<string>()
    for (;;) {
      const requests = [...graph.resolutionRequests(), ...graph.importResolutionRequests()]
      const pending = requests.filter(
        ({ importer, specifier }) => !done.has(`${importer}\0${specifier}`),
      )
      if (!pending.length) break
      const links = new Map<string, { specifier: string; moduleId: string }[]>()
      // Include all current links when extending an importer's edges.
      for (const request of requests) {
        const { importer, specifier } = request
        const key = `${importer}\0${specifier}`
        if (links.get(importer)?.some((binding) => binding.specifier === specifier)) continue
        const resolved = resolve(specifier, importer)
        if (!done.has(key)) {
          resolutions.push({
            platform,
            importer,
            specifier,
            status: resolved ? 'resolved' : 'unresolved',
            resolved,
            reason: resolved
              ? undefined
              : 'No unique admitted static answer (missing/ambiguous file or unsupported package/custom resolver).',
          })
          done.add(key)
        }
        if (resolved) {
          scan(resolved)
          const bindings = links.get(importer) ?? []
          bindings.push({ specifier, moduleId: resolved })
          links.set(importer, bindings)
        }
      }
      for (const [importer, bindings] of links) graph.setResolvedBindings(importer, bindings)
    }
  }
  return {
    graphs,
    registries: Object.fromEntries(
      Object.entries(graphs).map(([platform, graph]) => [platform, graph.moduleSources()]),
    ) as Record<AnalysisPlatform, ReturnType<StylexModuleCache['moduleSources']>>,
    resolutions,
    aliases: alias.fact,
    configurationInputs: alias.inputs,
    configurationResolutionPolicy: CONFIGURATION_RESOLUTION_POLICY,
    contextSources: [...contexts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, source]) => ({
        file,
        source,
        sha256: createHash('sha256').update(source).digest('hex'),
      })),
  }
}
