// Explicit shadow probe only: not installed by hozo(), no candidate-map writes.
import {
  captureOwnerManifests,
  type OwnerImportEdge,
  type OwnerManifestCapture,
  OwnerManifestEpoch,
  type OwnerManifestObservation,
  type ResolvedOwnerInstance,
  readResolvedOwnerManifest,
} from '@hozo/compiler/project'
import type { Plugin } from 'vite'

type GraphContext = {
  getModuleIds(): IterableIterator<string>
  getModuleInfo(
    id: string,
  ): { importedIds: string[]; dynamicallyImportedIds: string[] } | null | undefined
  addWatchFile(id: string): void
}

/** @internal Package ownership must come from the adapter, not a name walk.
 * Unknown/virtual/external ownership is unresolved, never an empty contract.
 */
interface ProbeOptions {
  platform: string
  context: string
  locate(entry: string): ResolvedOwnerInstance | undefined
  observed(phase: 'graph' | 'output', capture: OwnerManifestCapture): void
}

/** A ready-graph experiment. IDs are resolved graph edges, NOT authored
 * import/export bindings. Both static and literal-dynamic edges are assessed.
 * A graph receipt is not a successful-build or owner-audit certificate.
 */
export function ownerManifestGraphProbe(options: ProbeOptions) {
  let epoch = new OwnerManifestEpoch()
  function capture(context: GraphContext) {
    const expected: OwnerImportEdge[] = [],
      observations: OwnerManifestObservation[] = []
    for (const id of context.getModuleIds()) {
      const module = context.getModuleInfo(id)
      if (!module) throw new Error('OWNER_MANIFEST_GRAPH_INCOMPLETE: module info unavailable')
      // Deduplicate a target imported both statically and dynamically.
      for (const entry of new Set([...module.importedIds, ...module.dynamicallyImportedIds])) {
        // Vite virtual IDs may contain NUL. Encode graph identity losslessly;
        // do not weaken the data reader's filesystem/identity constraints.
        const edge = {
          importer: JSON.stringify(['vite-module', id]),
          specifier: JSON.stringify(['vite-module', entry]),
        }
        expected.push(edge)
        const resolved = options.locate(entry)
        const observation = resolved
          ? readResolvedOwnerManifest(edge, resolved)
          : {
              ...edge,
              status: 'unresolved' as const,
              reason: 'adapter-package-ownership-unavailable',
            }
        observations.push(observation)
        if (observation.status === 'resolved') {
          context.addWatchFile(`${observation.instance}/package.json`)
          if (observation.manifest.kind !== 'none') context.addWatchFile(observation.manifest.file)
        }
      }
    }
    return captureOwnerManifests(expected, observations, {
      platform: options.platform,
      epoch: options.context,
    })
  }
  const plugin: Plugin = {
    name: 'hozo:owner-manifest-graph-probe',
    apply: 'build',
    buildStart() {
      epoch.invalidate()
      epoch = new OwnerManifestEpoch()
    },
    buildEnd(error) {
      if (error) {
        epoch.invalidate()
        return
      }
      const next = capture(this)
      options.observed('graph', next)
      epoch.adopt(next)
    },
    generateBundle: {
      order: 'post',
      handler() {
        const next = capture(this)
        epoch.adopt(next)
        options.observed('output', next)
      },
    },
    watchChange() {
      epoch.invalidate()
    },
    closeBundle() {
      epoch.invalidate()
    },
  }
  return { plugin, current: () => epoch }
}
