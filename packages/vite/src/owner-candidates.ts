// Explicit production-build experiment, not automatic package discovery.
import { createHash } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'
import {
  captureOwnerManifests,
  collectOwnerPackageContributions,
  locateResolvedOwnerPackage,
  type OwnerImportEdge,
  OwnerManifestEpoch,
  type OwnerManifestLease,
  type OwnerManifestObservation,
  type OwnerPackageContributions,
  type ResolvedOwnerInstance,
  readBoundedUtf8File,
  readResolvedOwnerManifest,
} from '@hozo/compiler/project'

export interface ViteOwnerCandidatePlan {
  /** Finite startup imports, resolved by Vite BEFORE candidate CSS is consumed. */
  edges: readonly OwnerImportEdge[]
  /** Optional embedding override. Otherwise observe actual physical ownership. */
  locate?(entry: string): ResolvedOwnerInstance | undefined
  context: string
}
type Graph = {
  getModuleIds(): IterableIterator<string>
  getModuleInfo(
    id: string,
  ):
    | { importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] }
    | null
    | undefined
}
export interface ViteOwnerCandidateSession {
  /** Exact frozen observations; owner delivery may borrow, never replace it. */
  lease: OwnerManifestLease
  contributions: Extract<OwnerPackageContributions, { status: 'complete' }>
  watchFiles: readonly string[]
  watches(file: string): boolean
  check(): void
  validate(): void
  validateGraph(graph: Graph): void
  invalidate(): void
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
function fail(reason: string): never {
  throw new Error(`Vite owner candidates INCOMPLETE: ${reason}`)
}
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** @internal Resolver-backed candidate-only capture. Completeness is relative
 * to the explicit startup plan, not a claim to know the entire module graph.
 * No warm transform polling: revalidate at CSS/build/output boundaries and
 * retire leases on watcher signals. JS entries/config are never executed here.
 */
export async function captureViteOwnerCandidates(
  plan: ViteOwnerCandidatePlan,
  resolve: (
    edge: OwnerImportEdge,
  ) => Promise<{ id: string; external?: unknown } | null | undefined>,
  context: string,
): Promise<ViteOwnerCandidateSession> {
  if (
    !Array.isArray(plan.edges) ||
    !plan.edges.length ||
    plan.edges.length > 512 ||
    !plan.context ||
    plan.context.length > 4096
  )
    fail('startup plan/budget unavailable')
  const edges = plan.edges.map(({ importer, specifier }) => {
    if (
      !path.isAbsolute(importer) ||
      !specifier ||
      importer.length > 4096 ||
      specifier.length > 4096 ||
      importer.includes('\0') ||
      specifier.includes('\0')
    )
      fail('invalid startup import')
    return { importer, specifier }
  })
  const locateOverride = plan.locate
  const selected: { edge: OwnerImportEdge; entry: string }[] = []
  const observations: OwnerManifestObservation[] = []
  const metadata = new Map<string, string>()
  const watch = new Set<string>()
  const boundaries = new Map<string, string | null>()
  const origins = new Map<string, string>()
  let metadataBytes = 0
  const epoch = new OwnerManifestEpoch()
  function locate(entry: string): ResolvedOwnerInstance | undefined {
    if (locateOverride) return locateOverride(entry)
    const result = locateResolvedOwnerPackage(entry)
    if (result.status !== 'resolved') return undefined
    for (const { file, sha256 } of result.boundaries) {
      if (boundaries.has(file) && boundaries.get(file) !== sha256) fail('package boundary changed')
      if (boundaries.size >= 4096 && !boundaries.has(file)) fail('package boundary budget')
      boundaries.set(file, sha256)
      watch.add(file)
    }
    return result.instance
  }
  function packageMetadata(owner: ResolvedOwnerInstance) {
    const root = realpathSync(owner.packageRoot)
    const file = path.join(root, 'package.json')
    if (!inside(root, realpathSync(file))) fail('metadata escapes instance')
    const text = readBoundedUtf8File(file, 65_536)
    if (!metadata.has(file)) metadataBytes += Buffer.byteLength(text)
    if ((metadata.size >= 128 && !metadata.has(file)) || metadataBytes > 2_097_152)
      fail('metadata budget')
    const revision = hash(text)
    if (metadata.has(file) && metadata.get(file) !== revision) fail('metadata changed')
    metadata.set(file, revision)
    watch.add(file)
    const declared = JSON.parse(text)?.hozo?.manifest ?? null
    if (declared !== owner.declaredManifest) fail('metadata declaration disagrees with ownership')
  }
  function observe(edge: OwnerImportEdge, entry: string) {
    const owner = locate(entry)
    if (!owner || path.resolve(owner.entry) !== path.resolve(entry))
      fail('entry ownership unavailable')
    packageMetadata(owner)
    const observation = readResolvedOwnerManifest(edge, owner)
    if (observation.status === 'resolved' && observation.manifest.kind !== 'none') {
      watch.add(observation.manifest.file)
      watch.add(path.resolve(owner.packageRoot, owner.declaredManifest!))
    }
    return observation
  }
  for (const edge of edges) {
    const origin = locate(edge.importer)
    if (!origin) fail('importer ownership unavailable')
    origins.set(edge.importer, JSON.stringify(origin))
    packageMetadata(origin)
    const resolved = await resolve(edge)
    if (!resolved || resolved.external) fail('startup resolution unavailable or external')
    selected.push({ edge, entry: resolved.id })
    // Observe at selection, not after ALL asynchronous resolutions. Otherwise
    // a later resolver can replace an earlier package and bless mixed inputs.
    observations.push(observe(edge, resolved.id))
  }
  const capture = () =>
    captureOwnerManifests(
      edges,
      selected.map(({ edge, entry }) => observe(edge, entry)),
      { platform: 'web', epoch: context },
    )
  const frozen = captureOwnerManifests(edges, observations, { platform: 'web', epoch: context })
  epoch.adopt(frozen)
  const contributions = collectOwnerPackageContributions(frozen)
  if (contributions.status !== 'complete') {
    epoch.invalidate()
    fail('package channels unavailable')
  }
  const participants = new Map(
    contributions.instances.map((row) => [row.instance, new Set(row.entries)]),
  )
  const lease = epoch.lease()
  const check = () => lease.check()
  function validate() {
    try {
      check()
      // Newly created nearer metadata changes ownership even if the old
      // package/manifest bytes are identical. Never treat absence as "no watch".
      for (const [file, revision] of boundaries) {
        const stat = lstatSync(file, { throwIfNoEntry: false })
        if (
          revision === null
            ? !!stat
            : !stat?.isFile() ||
              stat.isSymbolicLink() ||
              hash(readBoundedUtf8File(file, 65_536)) !== revision
        )
          fail('package boundary changed')
      }
      for (const [file, identity] of origins)
        if (JSON.stringify(locate(file)) !== identity) fail('importer ownership changed')
      for (const [file, revision] of metadata)
        if (hash(readBoundedUtf8File(file, 65_536)) !== revision) fail('metadata changed')
      epoch.adopt(capture())
    } catch (error) {
      epoch.invalidate()
      throw error
    }
  }
  function validateGraph(graph: Graph) {
    try {
      validate()
      for (const id of graph.getModuleIds()) {
        const info = graph.getModuleInfo(id)
        if (!info) fail('graph module info unavailable')
        for (const target of new Set([...info.importedIds, ...info.dynamicallyImportedIds])) {
          // External/virtual and non-JS domains are outside this package-JS
          // assessment; they are not promoted to an assessed empty manifest.
          const physical = target.split('?')[0]!
          if (
            target.includes('\0') ||
            !path.isAbsolute(physical) ||
            !/\.[cm]?[jt]sx?$/.test(physical)
          )
            continue
          const owner = locate(physical)
          if (!owner) fail('graph package ownership unavailable')
          packageMetadata(owner)
          if (owner.declaredManifest === null) continue
          const root = realpathSync(owner.packageRoot)
          const entries = participants.get(root)
          if (!entries || target.includes('?')) fail('late or derived participant')
          const origin = locate(id.split('?')[0]!)
          const sameInstance = origin && realpathSync(origin.packageRoot) === root
          if (!sameInstance && !entries.has(realpathSync(physical)))
            fail('unassessed package entry')
        }
      }
      validate()
    } catch (error) {
      epoch.invalidate()
      throw error
    }
  }
  // Admission fences edits during the serial resolver pass as well as edits
  // after it. No already-obsolete set reaches candidate CSS preparation.
  validate()
  return Object.freeze({
    lease,
    contributions,
    watchFiles: Object.freeze([...watch]),
    watches: (file: string) => watch.has(path.resolve(file)),
    check,
    validate,
    validateGraph,
    invalidate: () => epoch.invalidate(),
  })
}
