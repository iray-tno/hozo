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
import { inspectViteOwnerSource } from './owner-source-plan.ts'

export interface ViteOwnerCandidatePlan {
  /** Finite startup imports, resolved by Vite BEFORE candidate CSS is consumed. */
  edges: readonly OwnerImportEdge[]
  /** Optional embedding override. Otherwise observe actual physical ownership. */
  locate?(entry: string): ResolvedOwnerInstance | undefined
  context: string
  /** Optional exact source observations that produced the finite startup edges. */
  sources?: readonly { readonly file: string; readonly sha256: string }[]
  /** Bounded static ESM expansion through the same actual resolver, not require/dynamic imports. */
  followStaticImports?: boolean
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
  sourceFiles: readonly string[]
  sourceObservations: readonly Readonly<{ file: string; sha256: string }>[]
  sourceImports(file: string): readonly Readonly<{ source: string; imported: string }>[] | undefined
  /** Resolver boundaries, never ordinary/empty JS package or caller claims. */
  unassessedImports: readonly Readonly<
    OwnerImportEdge & {
      reason: 'external' | 'non-js-source'
      entry: string
      sha256?: string
    }
  >[]
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
    (!plan.edges.length && !Array.isArray(plan.sources)) ||
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
  const external: (OwnerImportEdge & {
    reason: 'external' | 'non-js-source'
    entry: string
    sha256?: string
  })[] = []
  const observations: OwnerManifestObservation[] = []
  const metadata = new Map<string, string>()
  const watch = new Set<string>()
  const boundaries = new Map<string, string | null>()
  const origins = new Map<string, string>()
  let metadataBytes = 0
  const epoch = new OwnerManifestEpoch()
  const sources = plan.sources?.map((source) => ({ ...source })) ?? []
  const followStaticImports = plan.followStaticImports === true
  const sourceImports = new Map<string, readonly Readonly<{ source: string; imported: string }>[]>()
  function rememberImports(input: ReturnType<typeof inspectViteOwnerSource>) {
    sourceImports.set(
      input.file,
      Object.freeze(
        input.bindings.map(({ source, imported }) => Object.freeze({ source, imported })),
      ),
    )
  }
  if (followStaticImports && (!Array.isArray(plan.sources) || plan.locate))
    fail('static source traversal requires physical source observations')
  if (sources.length > 512 || new Set(sources.map((source) => source.file)).size !== sources.length)
    fail('source observation budget/duplicates')
  for (const source of sources) {
    if (!path.isAbsolute(source.file) || !/^[a-f0-9]{64}$/.test(source.sha256))
      fail('invalid source observation')
    watch.add(source.file)
  }
  function validateSources() {
    let bytes = 0
    for (const source of sources) {
      const text = readBoundedUtf8File(source.file, 4_194_304)
      bytes += Buffer.byteLength(text)
      if (bytes > 33_554_432 || hash(text) !== source.sha256) fail('source snapshot changed')
    }
    return bytes
  }
  let sourceBytes = validateSources()
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
  function rememberOrigin(file: string, origin: ResolvedOwnerInstance) {
    const identity = JSON.stringify(origin)
    // Source hashes cannot detect a directory-link retarget with identical
    // bytes. The first physical importer identity is part of the snapshot;
    // later resolutions must compare it, never replace the evidence.
    if (origins.has(file) && origins.get(file) !== identity)
      fail('source ownership changed during capture')
    origins.set(file, identity)
  }
  // An inspected source can have no value imports (including type-only files).
  // Observe its ownership anyway: absence of edges is data, not missing input,
  // and a nearer metadata boundary must still retire this empty snapshot.
  for (const source of sources) {
    const origin = locate(source.file)
    if (!origin) fail('source ownership unavailable')
    rememberOrigin(source.file, origin)
    packageMetadata(origin)
    if (followStaticImports) {
      const inspected = inspectViteOwnerSource(source.file)
      if (inspected.sha256 !== source.sha256) fail('source snapshot changed')
      rememberImports(inspected)
    }
  }
  const inspected = new Set(sources.map((source) => source.file))
  const edgeKeys = new Set(edges.map((edge) => JSON.stringify([edge.importer, edge.specifier])))
  if (edgeKeys.size !== edges.length) fail('duplicate startup import')
  for (const edge of edges) {
    const origin = locate(edge.importer)
    if (!origin) fail('importer ownership unavailable')
    rememberOrigin(edge.importer, origin)
    packageMetadata(origin)
    const resolved = await resolve(edge)
    if (resolved?.external && followStaticImports) {
      if (!resolved.id || resolved.id.length > 4096 || resolved.id.includes('\0'))
        fail('invalid external resolver identity')
      external.push({ ...edge, reason: 'external', entry: resolved.id })
      continue
    }
    if (!resolved || resolved.external) fail('startup resolution unavailable or external')
    const physicalSource = path.resolve(resolved.id)
    if (followStaticImports && /\.(css|json)$/.test(resolved.id)) {
      // Vite owns CSS/JSON semantics. Observe their bytes/ownership without
      // treating them as empty JS packages, parsing them as JSX or offering
      // their package's component exports as caller bindings.
      const target = locate(resolved.id)
      if (!target || path.resolve(target.entry) !== physicalSource)
        fail('text import ownership unavailable')
      rememberOrigin(physicalSource, target)
      packageMetadata(target)
      if (!inspected.has(physicalSource)) {
        if (sources.length >= 512) fail('static source file budget')
        const text = readBoundedUtf8File(physicalSource, 4_194_304)
        sourceBytes += Buffer.byteLength(text)
        if (sourceBytes > 33_554_432) fail('static source byte budget')
        sources.push({ file: physicalSource, sha256: hash(text) })
        inspected.add(physicalSource)
        watch.add(physicalSource)
      }
      external.push({
        ...edge,
        reason: 'non-js-source',
        entry: physicalSource,
        sha256: sources.find((source) => source.file === physicalSource)!.sha256,
      })
      continue
    }
    selected.push({ edge, entry: resolved.id })
    // Observe at selection, not after ALL asynchronous resolutions. Otherwise
    // a later resolver can replace an earlier package and bless mixed inputs.
    observations.push(observe(edge, resolved.id))
    if (followStaticImports && !inspected.has(physicalSource)) {
      // Only physical JS sources can be parsed before other plugins run.
      // Query/virtual/non-JS requests are refused, never assessed as empty.
      if (!/\.[cm]?[jt]sx?$/.test(resolved.id)) fail('non-JS static dependency')
      if (sources.length >= 512) fail('static source file budget')
      const source = inspectViteOwnerSource(physicalSource)
      rememberImports(source)
      sourceBytes += source.bytes
      if (sourceBytes > 33_554_432) fail('static source byte budget')
      inspected.add(physicalSource)
      sources.push({ file: source.file, sha256: source.sha256 })
      watch.add(source.file)
      for (const next of source.edges) {
        const key = JSON.stringify([next.importer, next.specifier])
        if (edgeKeys.has(key)) continue
        if (edges.length >= 512) fail('static source edge budget')
        edges.push(next)
        edgeKeys.add(key)
      }
    }
  }
  // Dependency bytes participate in identity, not only root-source hashes.
  const captureContext = followStaticImports
    ? hash(JSON.stringify(['vite-static-source-graph-0', context, sources, external]))
    : context
  const capturedEdges = selected.map(({ edge }) => edge)
  const capture = () =>
    captureOwnerManifests(
      capturedEdges,
      selected.map(({ edge, entry }) => observe(edge, entry)),
      { platform: 'web', epoch: captureContext },
    )
  const frozen = captureOwnerManifests(capturedEdges, observations, {
    platform: 'web',
    epoch: captureContext,
  })
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
      validateSources()
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
    sourceFiles: Object.freeze(sources.map((source) => source.file)),
    sourceObservations: Object.freeze(sources.map((source) => Object.freeze({ ...source }))),
    sourceImports: (file: string) => {
      check()
      return sourceImports.get(file)
    },
    unassessedImports: Object.freeze(external.map((edge) => Object.freeze(edge))),
    watches: (file: string) => watch.has(path.resolve(file)),
    check,
    validate,
    validateGraph,
    invalidate: () => epoch.invalidate(),
  })
}
