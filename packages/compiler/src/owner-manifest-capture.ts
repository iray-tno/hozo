// RFC010 shadow capture only. Adapters own resolution and the complete edge set;
// this module owns validated contribution identity, not a package-name resolver.
import { createHash } from 'node:crypto'
import {
  OWNER_SHADOW_VERSION,
  type OwnerContractShadow,
  parseOwnerContractShadow,
} from './owner-contract.ts'
import {
  OWNER_PACKAGE_SCHEMA,
  type OwnerPackageShadow,
  parseOwnerPackageShadow,
} from './owner-package.ts'

export interface OwnerImportEdge {
  importer: string
  specifier: string
}
export type OwnerManifestObservation = OwnerImportEdge &
  (
    | { status: 'unresolved'; reason: string }
    | {
        status: 'resolved'
        instance: string
        entry: string
        manifest:
          | { kind: 'none' }
          | { kind: 'missing'; file: string }
          | { kind: 'present'; file: string; text: string }
      }
  )
type Frozen<T> = T extends readonly (infer V)[]
  ? readonly Frozen<V>[]
  : T extends object
    ? { readonly [K in keyof T]: Frozen<T[K]> }
    : T
interface Binding extends OwnerImportEdge {
  instance: string
  entry: string
  manifest: {
    file: string
    sha256: string
    shadow: OwnerContractShadow
    package?: OwnerPackageShadow
  } | null
}
interface Issue extends OwnerImportEdge {
  kind:
    | 'missing-resolution'
    | 'unresolved'
    | 'unexpected-edge'
    | 'ambiguous-resolution'
    | 'missing-manifest'
    | 'invalid-manifest'
    | 'conflicting-instance'
  reason?: string
}
export type OwnerManifestCapture = Frozen<
  { scope: 'declared-owner-resolution-set'; platform: string; epoch: string } & (
    | { status: 'complete'; fingerprint: string; bindings: Binding[] }
    | { status: 'incomplete'; issues: Issue[] }
  )
>

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const key = (edge: OwnerImportEdge) => JSON.stringify([edge.importer, edge.specifier])
const compare = ([a]: readonly [string, unknown], [b]: readonly [string, unknown]) =>
  a < b ? -1 : a > b ? 1 : 0
function identity(value: string) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
    throw new Error('Owner capture needs bounded nonempty resolver identities')
  return value
}
function edge(input: OwnerImportEdge): OwnerImportEdge {
  return { importer: identity(input.importer), specifier: identity(input.specifier) }
}
function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value as Frozen<T>
}

/** @internal Freeze one adapter-declared finite observation set. `complete`
 * is not proof that an adapter supplied its entire transitive graph. A late
 * edge, changed content or entry requires a new capture/cache epoch. No partial
 * usable binding map/fingerprint is returned on incomplete input. Existing v1
 * readers and generated candidate maps are deliberately not consumers yet.
 */
export function captureOwnerManifests(
  expected: readonly OwnerImportEdge[],
  observations: readonly OwnerManifestObservation[],
  options: { platform: string; epoch: string },
): OwnerManifestCapture {
  const platform = identity(options.platform),
    epoch = identity(options.epoch)
  if (expected.length > 512 || observations.length > 1024)
    throw new Error('Owner capture edge budget exceeded')
  const wanted = new Map(
    expected.map((input) => {
      const value = edge(input)
      return [key(value), value]
    }),
  )
  if (wanted.size !== expected.length) throw new Error('Duplicate expected owner import edge')
  const seen = new Map<string, Map<string, OwnerManifestObservation>>()
  let bytes = 0
  for (const observation of observations) {
    const value = edge(observation)
    let copy: OwnerManifestObservation
    if (observation.status === 'unresolved')
      copy = { ...value, status: 'unresolved', reason: identity(observation.reason) }
    else if (observation.status === 'resolved') {
      const { manifest } = observation
      if (!['none', 'missing', 'present'].includes(manifest.kind))
        throw new Error('Invalid owner manifest observation kind')
      if (manifest.kind !== 'none') identity(manifest.file)
      if (manifest.kind === 'present') {
        if (typeof manifest.text !== 'string')
          throw new Error('Owner manifest input must be text, not executable config')
        bytes += Buffer.byteLength(manifest.text)
        if (bytes > 2_097_152) throw new Error('Owner capture content budget exceeded')
      }
      copy = {
        ...value,
        status: 'resolved',
        instance: identity(observation.instance),
        entry: identity(observation.entry),
        manifest:
          manifest.kind === 'none'
            ? { kind: 'none' }
            : manifest.kind === 'missing'
              ? { kind: 'missing', file: manifest.file }
              : { kind: 'present', file: manifest.file, text: manifest.text },
      }
    } else throw new Error('Invalid owner resolution status')
    const rows = seen.get(key(value)) ?? new Map()
    rows.set(JSON.stringify(copy), copy)
    seen.set(key(value), rows)
  }
  const issues: Issue[] = [],
    bindings: Binding[] = []
  const instances = new Map<string, string>()
  for (const [id, rows] of [...seen].sort(compare))
    if (!wanted.has(id))
      issues.push({ ...edge(rows.values().next().value!), kind: 'unexpected-edge' })
  for (const [id, value] of [...wanted].sort(compare)) {
    const rows = seen.get(id)
    if (!rows?.size) {
      issues.push({ ...value, kind: 'missing-resolution' })
      continue
    }
    if (rows.size !== 1) {
      issues.push({ ...value, kind: 'ambiguous-resolution' })
      continue
    }
    const observation = rows.values().next().value!
    if (observation.status === 'unresolved') {
      issues.push({ ...value, kind: 'unresolved', reason: observation.reason })
      continue
    }
    const { instance, entry, manifest } = observation
    if (manifest.kind === 'missing') {
      issues.push({ ...value, kind: 'missing-manifest', reason: manifest.file })
      continue
    }
    if (manifest.kind === 'none') {
      if (instances.has(instance) && instances.get(instance) !== 'none') {
        issues.push({ ...value, kind: 'conflicting-instance' })
        continue
      }
      instances.set(instance, 'none')
      bindings.push({ ...value, instance, entry, manifest: null })
      continue
    }
    let shadow: OwnerContractShadow
    let packageData: OwnerPackageShadow | undefined
    try {
      const schema = JSON.parse(manifest.text)?.schema
      if (schema === OWNER_PACKAGE_SCHEMA) {
        packageData = parseOwnerPackageShadow(manifest.text)
        shadow = packageData.owners ?? { schema: OWNER_SHADOW_VERSION, contracts: [] }
      } else shadow = parseOwnerContractShadow(manifest.text)
    } catch (error) {
      issues.push({ ...value, kind: 'invalid-manifest', reason: String(error) })
      continue
    }
    const sha256 = hash(manifest.text),
      claim = JSON.stringify([manifest.file, sha256])
    if (instances.has(instance) && instances.get(instance) !== claim) {
      issues.push({ ...value, kind: 'conflicting-instance' })
      continue
    }
    instances.set(instance, claim)
    bindings.push({
      ...value,
      instance,
      entry,
      manifest: {
        file: manifest.file,
        sha256,
        shadow,
        ...(packageData ? { package: packageData } : {}),
      },
    })
  }
  const base = { scope: 'declared-owner-resolution-set' as const, platform, epoch }
  if (issues.length) return freeze({ ...base, status: 'incomplete' as const, issues })
  return freeze({
    ...base,
    status: 'complete' as const,
    fingerprint: hash(JSON.stringify({ schema: 'owner-manifest-capture-0', ...base, bindings })),
    bindings,
  })
}

/** @internal Call at an adapter's freeze/use boundary with fresh observations,
 * not as a per-component filesystem poll. This neither refreshes a snapshot nor
 * silently swaps rank namespaces; the adapter must restart/rebuild on failure.
 */
export function assertOwnerManifestCaptureCurrent(
  captured: OwnerManifestCapture,
  current: OwnerManifestCapture,
): void {
  if (
    captured.status !== 'complete' ||
    current.status !== 'complete' ||
    captured.fingerprint !== current.fingerprint
  )
    throw new Error(
      'OWNER_MANIFEST_CAPTURE_INVALIDATED: rebuild the declared contribution set before use',
    )
}
