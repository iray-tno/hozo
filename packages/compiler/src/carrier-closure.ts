// The package instances whose manifests a build's candidates come from,
// captured before any module graph exists (#2047, decision 012 point 4).
//
// docs/measurements/manifest-candidate-capture.md measured three closures
// against what real Metro and Vite builds reach. Following every declaration
// cost 0.8–3.3 s, held 87–98% instances no bundle reached, and today's Metro
// collector refuses a real app outright on its first unresolvable name. The
// closure kept here descends only into packages that declare
// `hozo.manifest`, which took 26–103 ms and still held every manifest either
// build reached. What it can miss -- a manifest package reached by a relative
// path, or only through a package without a manifest -- is left to a guard at
// resolve time, which compares against `instances` below.

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  captureOwnerManifests,
  type OwnerImportEdge,
  type OwnerManifestObservation,
} from './owner-manifest-capture.ts'
import { readResolvedOwnerManifest } from './owner-manifest-read.ts'
import {
  collectOwnerPackageContributions,
  type OwnerPackageContributions,
} from './owner-package-contributions.ts'
import { locateResolvedOwnerPackage, type OwnerMetadataBoundary } from './owner-package-location.ts'

/** A package instance with a manifest that the closure reached. */
export interface CarrierInstance {
  /** Realpath of the package directory. Two versions of one name are two. */
  readonly instance: string
  readonly name: string
  /** The `hozo.manifest` path its `package.json` declares. */
  readonly manifest: string
}

export interface CarrierClosure {
  readonly root: string
  readonly carriers: readonly CarrierInstance[]
  /** Every instance located, carrier or not, by realpath. */
  readonly instances: ReadonlySet<string>
  /** Declared names that located nothing. Not an error: a types-only package,
   * a package imported only by subpath whose `exports` hide both `.` and
   * `./package.json`, or an optional platform dependency that is not installed.
   * One of them carrying a manifest is what the resolve-time guard catches. */
  readonly unlocated: readonly OwnerImportEdge[]
  /** The `package.json` files read, with their hashes, for a staleness check. */
  readonly metadata: readonly OwnerMetadataBoundary[]
  /** Incomplete when any carrier's manifest is missing, unreadable or lacks
   * package channels, or the closure is over budget: the ordinary route. */
  readonly contributions: OwnerPackageContributions
}

export interface CarrierClosureOptions {
  platform: string
  epoch: string
  /**
   * Where `name`, as declared by the package at `importerRoot`, is installed:
   * an absolute file inside that instance, or undefined. Defaults to Node's
   * resolution of `<name>/package.json`, then of the bare name, then the
   * node_modules lookup itself. An adapter
   * that has the bundler's resolver at capture time may pass it instead.
   */
  locate?(importerRoot: string, name: string): string | undefined
  /** Carrier edges, at most captureOwnerManifests' own budget of 512. */
  maxEdges?: number
}

/** A resolution into a package with a manifest that the capture did not hold. */
export interface CarrierTrip {
  readonly instance: string
  readonly name: string
}

const NAME = /^(?:@[\w.-]+\/)?[\w.-]+$/
const ROOT_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
// An app bundles what it lists in devDependencies; a package's own are its
// build tools, which its consumers never install.
const PACKAGE_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies']

/** The nearest `package.json` above `file` named `name`, stopping at node_modules. */
function namedPackageAbove(file: string, name: string): string | undefined {
  let dir = path.dirname(file)
  for (let depth = 0; depth < 64; depth++) {
    const metadata = path.join(dir, 'package.json')
    if (existsSync(metadata)) {
      try {
        if (JSON.parse(readFileSync(metadata, 'utf8'))?.name === name) return metadata
      } catch {}
    }
    const parent = path.dirname(dir)
    if (parent === dir || path.basename(parent) === 'node_modules') return undefined
    dir = parent
  }
  return undefined
}

/** Node's answer for where a declared name is installed. */
export function locateDeclaredPackage(importerRoot: string, name: string): string | undefined {
  const require = createRequire(path.join(importerRoot, 'package.json'))
  try {
    return require.resolve(`${name}/package.json`)
  } catch {}
  // `exports` without `./package.json`: the entry is inside the instance, and
  // the nearest metadata with this name is its root, not a nested
  // `{"type":"module"}` marker below it.
  try {
    const entry = require.resolve(name)
    if (path.isAbsolute(entry)) return namedPackageAbove(entry, name)
  } catch {}
  // An ESM-only package has no `require` condition at all, so neither
  // question above has an answer (`@astrojs/starlight` in apps/landing).
  // Where it is installed is still the ordinary node_modules lookup.
  for (let dir = importerRoot; ; dir = path.dirname(dir)) {
    const metadata = path.join(dir, 'node_modules', name, 'package.json')
    if (existsSync(metadata)) return metadata
    if (path.dirname(dir) === dir) return undefined
  }
}

function declaredNames(json: Record<string, unknown>, fields: readonly string[]): string[] {
  const names = new Set<string>()
  for (const field of fields) {
    const entries = json[field]
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue
    for (const name of Object.keys(entries)) names.add(name)
  }
  return [...names].sort()
}

type Owner = { instance: string; name: string; manifest: boolean } | null

/**
 * The guard for every resolution after the capture: decision 2 of
 * docs/measurements/manifest-candidate-capture.md.
 *
 * Returns a trip when `file` lies in a package instance whose `package.json`
 * declares `hozo.manifest` and that the capture did not hold. Its candidates
 * would be missing from the frozen set, so the build has to stop before
 * output rather than ship a component whose classes have no rules. Any other
 * late package is ignored: 68 instances arrived late in the measured Metro
 * build and none carried a manifest, so a guard refusing every unknown
 * package would refuse an ordinary app.
 *
 * The owner is the nearest `package.json` with a `name`, so a nested
 * `{"type":"module"}` marker inside `dist/` does not hide its package. Owners
 * are cached per directory: one metadata read per instance, then lookups.
 */
export function carrierGuard(closure: CarrierClosure): (file: string) => CarrierTrip | undefined {
  const allowed = new Set([closure.root, ...closure.carriers.map((row) => row.instance)])
  const ownerOf = ownerLookup()
  return (file) => {
    const physical = file.split('?')[0]!
    if (!path.isAbsolute(physical) || physical.includes('\0')) return undefined
    const owner = ownerOf(path.dirname(physical))
    if (!owner?.manifest || allowed.has(owner.instance)) return undefined
    return Object.freeze({ instance: owner.instance, name: owner.name })
  }
}

const TEST_FILE = /\.(?:test|spec|bench)\.[cm]?[jt]sx?$/

/**
 * Whether a file is source that a captured carrier ships for its consumer to
 * compile (`compiledByConsumer` in its manifest).
 *
 * The bundler has to admit such a file to the Hozo transform itself. Until
 * #2047, Vite admitted a file under `node_modules` only if the `@hozo/*`
 * source walk had listed it. So a source-distributed package from anywhere
 * else was never compiled, and deleting the walk would have stopped compiling
 * `@hozo/ui` too. Its test files stay out, as they did from the walk.
 */
export function carrierSources(closure: CarrierClosure): (file: string) => boolean {
  const compiled = new Set(
    closure.contributions.status === 'complete'
      ? closure.contributions.instances
          .filter((row) => row.data.compiledByConsumer)
          .map((row) => row.instance)
      : [],
  )
  const ownerOf = ownerLookup()
  return (file) => {
    if (compiled.size === 0) return false
    const physical = file.split('?')[0]!
    if (!path.isAbsolute(physical) || physical.includes('\0') || TEST_FILE.test(physical))
      return false
    const owner = ownerOf(path.dirname(physical))
    return owner !== null && compiled.has(owner.instance)
  }
}

/** The package owning a directory, cached per directory. */
function ownerLookup(): (dir: string) => Owner {
  const owners = new Map<string, Owner>()
  return function ownerOf(start: string): Owner {
    const visited: string[] = []
    let dir = start
    let found: Owner = null
    for (;;) {
      const cached = owners.get(dir)
      if (cached !== undefined) {
        found = cached
        break
      }
      visited.push(dir)
      const metadata = path.join(dir, 'package.json')
      if (existsSync(metadata)) {
        try {
          const json = JSON.parse(readFileSync(metadata, 'utf8'))
          if (typeof json?.name === 'string') {
            found = {
              instance: realpathSync(dir),
              name: json.name,
              manifest: typeof json.hozo?.manifest === 'string',
            }
            break
          }
        } catch {}
      }
      const parent = path.dirname(dir)
      if (parent === dir || path.basename(dir) === 'node_modules') break
      dir = parent
    }
    for (const seen of visited) owners.set(seen, found)
    return found
  }
}

/** The error a trip fails the build with. */
export function carrierTripMessage(closure: CarrierClosure, trip: CarrierTrip): string {
  return (
    `[hozo] ${trip.name} (${trip.instance}) declares a Hozo manifest, but the ` +
    `candidates captured at startup do not include it, so its classes would ` +
    `have no styles. Add ${trip.name} to the dependencies in ` +
    `${path.join(closure.root, 'package.json')} and restart, so the next ` +
    `capture holds it.`
  )
}

/**
 * The app root's declared packages, plus everything declared by a package
 * that declares a manifest, located once and frozen.
 *
 * Nothing is executed and no source is read: only `package.json` files and
 * the manifests they name. Decision 012 point 4 asks for a capture that is
 * whole or not used at all, so `contributions` is either complete for every
 * carrier found or incomplete as a whole.
 */
export function captureCarrierClosure(
  root: string,
  options: CarrierClosureOptions,
): CarrierClosure {
  const locate = options.locate ?? locateDeclaredPackage
  const maxEdges = options.maxEdges ?? 512
  const rootMetadata = path.join(path.resolve(root), 'package.json')
  const rootLocation = locateResolvedOwnerPackage(rootMetadata)
  if (rootLocation.status !== 'resolved')
    throw new Error(`[hozo] no package.json at ${root}: ${rootLocation.reason}`)

  const metadata = new Map<string, OwnerMetadataBoundary>()
  const instances = new Set<string>()
  const carriers = new Map<string, CarrierInstance>()
  const unlocated: OwnerImportEdge[] = []
  const edges: OwnerImportEdge[] = []
  const observations: OwnerManifestObservation[] = []
  const reasons: string[] = []

  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const remember = (boundaries: readonly OwnerMetadataBoundary[]) => {
    for (const row of boundaries) if (row.sha256 !== null) metadata.set(row.file, row)
  }
  remember(rootLocation.boundaries)
  const rootInstance = path.dirname(rootLocation.instance.entry)
  instances.add(rootInstance)

  const queue: { root: string; metadata: string; fields: readonly string[] }[] = [
    { root: rootInstance, metadata: rootLocation.instance.entry, fields: ROOT_FIELDS },
  ]
  while (queue.length) {
    const from = queue.shift()!
    for (const name of declaredNames(read(from.metadata), from.fields)) {
      const edge = { importer: from.metadata, specifier: name }
      const file = NAME.test(name) ? locate(from.root, name) : undefined
      const location = file === undefined ? undefined : locateResolvedOwnerPackage(file)
      if (location?.status !== 'resolved') {
        unlocated.push(edge)
        continue
      }
      remember(location.boundaries)
      const owner = location.instance
      const observation = readResolvedOwnerManifest(edge, owner)
      if (observation.status !== 'resolved') {
        unlocated.push(edge)
        continue
      }
      const instance = observation.instance
      const seen = instances.has(instance)
      instances.add(instance)
      if (owner.declaredManifest === null) continue
      if (edges.length >= maxEdges) {
        reasons.push('carrier-edge-budget')
        break
      }
      edges.push(edge)
      observations.push(observation)
      if (seen) continue
      const metadataFile = path.join(instance, 'package.json')
      carriers.set(instance, {
        instance,
        name: String(read(metadataFile).name ?? name),
        manifest: owner.declaredManifest,
      })
      queue.push({ root: instance, metadata: metadataFile, fields: PACKAGE_FIELDS })
    }
    if (reasons.length) break
  }

  const contributions: OwnerPackageContributions = reasons.length
    ? Object.freeze({ status: 'incomplete', reasons: Object.freeze(reasons) })
    : collectOwnerPackageContributions(
        captureOwnerManifests(edges, observations, {
          platform: options.platform,
          epoch: options.epoch,
        }),
      )
  const byPath = <T>(rows: Iterable<T>, key: (row: T) => string) =>
    [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
  return Object.freeze({
    root: rootInstance,
    carriers: Object.freeze(byPath(carriers.values(), (row) => row.instance)),
    instances,
    unlocated: Object.freeze(unlocated),
    metadata: Object.freeze(byPath(metadata.values(), (row) => row.file)),
    contributions,
  })
}
