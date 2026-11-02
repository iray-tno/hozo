// An explicit experiment: select from a resolver-backed lease, not a global
// component-name table. A selected unknown contract is still not an audit.
import type { OwnerManifestLease } from './owner-manifest-epoch.ts'

export interface OwnerContractRequest {
  importer: string
  specifier: string
  /** The selected entry for THIS import edge, not any entry of the package. */
  entry: string
  imported: string
  classProp: string
}
export interface OwnerContractIdentity extends Readonly<OwnerContractRequest> {
  readonly captureFingerprint: string
  readonly platform: string
  readonly epoch: string
  readonly instance: string
  readonly manifest: string
  readonly manifestSha256: string
  readonly owner: string
}

export interface OwnerCallerDiscovery {
  readonly scope: 'captured-importer-owner-bindings'
  readonly requests: readonly Readonly<OwnerContractRequest>[]
  readonly unassessed: readonly Readonly<{ specifier: string; reason: string }>[]
}

/** @internal Derive possible caller targets from exact captured edges and
 * published export/owner references. The existing parser still decides which
 * bindings/sites actually occur; aliases never become a global name table.
 * This is discovery in an explicitly selected assessment, not owner auditing.
 */
export function discoverOwnerPackageCallers(
  lease: OwnerManifestLease,
  importer: string,
  imports?: readonly { readonly source: string; readonly imported: string }[],
): OwnerCallerDiscovery {
  lease.check()
  if (
    typeof importer !== 'string' ||
    !importer ||
    importer.length > 4096 ||
    importer.includes('\0')
  )
    throw new Error('OWNER_CALLER_DISCOVERY_INVALID_IMPORTER')
  if (imports && imports.length > 2048) throw new Error('OWNER_CALLER_DISCOVERY_IMPORT_BUDGET')
  const names = imports === undefined ? undefined : new Map<string, Set<string>>()
  for (const item of imports ?? []) {
    for (const value of [item.source, item.imported])
      if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
        throw new Error('OWNER_CALLER_DISCOVERY_INVALID_IMPORT')
    const values = names!.get(item.source) ?? new Set<string>()
    values.add(item.imported)
    names!.set(item.source, values)
  }
  const requests: Readonly<OwnerContractRequest>[] = []
  const unassessed: { specifier: string; reason: string }[] = []
  for (const binding of lease.capture.bindings) {
    if (binding.importer !== importer) continue
    const imported = names?.get(binding.specifier)
    if (names && !imported) continue
    if (imported?.has('*'))
      unassessed.push({ specifier: binding.specifier, reason: 'namespace-binding' })
    const data = binding.manifest?.package
    if (!data) {
      unassessed.push({
        specifier: binding.specifier,
        reason: binding.manifest ? 'package-channels-unavailable' : 'ordinary-package',
      })
      continue
    }
    for (const exported of data.exports) {
      if (imported && !imported.has(exported.name)) continue
      const props = new Set(
        data.owners?.contracts
          .filter((contract) => exported.owners.includes(contract.owner))
          .map((contract) => contract.classProp),
      )
      for (const classProp of props) {
        const request = {
          importer: binding.importer,
          specifier: binding.specifier,
          entry: binding.entry,
          imported: exported.name,
          classProp,
        }
        const selected = selectOwnerPackageContract(lease, request)
        if (selected.status !== 'selected')
          unassessed.push({ specifier: binding.specifier, reason: selected.reason })
        else requests.push(Object.freeze(request))
        if (requests.length + unassessed.length > 64)
          throw new Error('OWNER_CALLER_DISCOVERY_BUDGET')
      }
    }
  }
  lease.check()
  return Object.freeze({
    scope: 'captured-importer-owner-bindings',
    requests: Object.freeze(requests),
    unassessed: Object.freeze(unassessed.map((row) => Object.freeze(row))),
  })
}
export type OwnerContractSelection =
  | Readonly<{
      status: 'unassessed'
      reason:
        | 'edge-not-captured'
        | 'entry-mismatch'
        | 'ordinary-package'
        | 'package-channels-unavailable'
        | 'export-not-declared'
        | 'owner-not-declared'
        | 'ambiguous-owner'
    }>
  | Readonly<{
      status: 'selected'
      identity: OwnerContractIdentity
      /** One exact contract, serialized once for the existing preview API. */
      shadow: string
      /** No IO. The adapter still owns fresh observations and watcher signals. */
      check(): void
    }>

/** @internal No resolution, filesystem access, alias chasing or audit upgrade.
 * Unassessed is not an empty contract and cannot authorize a rewrite.
 */
export function selectOwnerPackageContract(
  lease: OwnerManifestLease,
  request: OwnerContractRequest,
): OwnerContractSelection {
  lease.check()
  for (const key of ['importer', 'specifier', 'entry', 'imported', 'classProp'] as const) {
    const value = request[key]
    if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
      throw new Error('OWNER_CONTRACT_SELECTION_INVALID_REQUEST')
  }
  const unassessed = (
    reason: Extract<OwnerContractSelection, { status: 'unassessed' }>['reason'],
  ) => Object.freeze({ status: 'unassessed' as const, reason })
  const capture = lease.capture
  const binding = capture.bindings.find(
    (row) => row.importer === request.importer && row.specifier === request.specifier,
  )
  if (!binding) return unassessed('edge-not-captured')
  if (binding.entry !== request.entry) return unassessed('entry-mismatch')
  if (!binding.manifest) return unassessed('ordinary-package')
  const data = binding.manifest.package
  if (!data) return unassessed('package-channels-unavailable')
  const exported = data.exports.find((row) => row.name === request.imported)
  if (!exported) return unassessed('export-not-declared')
  const contracts =
    data.owners?.contracts.filter(
      (contract) =>
        exported.owners.includes(contract.owner) && contract.classProp === request.classProp,
    ) ?? []
  if (!contracts.length) return unassessed('owner-not-declared')
  if (contracts.length !== 1) return unassessed('ambiguous-owner')
  const contract = contracts[0]!
  const identity = Object.freeze({
    importer: binding.importer,
    specifier: binding.specifier,
    entry: binding.entry,
    imported: exported.name,
    classProp: contract.classProp,
    captureFingerprint: capture.fingerprint,
    platform: capture.platform,
    epoch: capture.epoch,
    instance: binding.instance,
    manifest: binding.manifest.file,
    manifestSha256: binding.manifest.sha256,
    owner: contract.owner,
  })
  return Object.freeze({
    status: 'selected' as const,
    identity,
    shadow: JSON.stringify({ schema: data.owners!.schema, contracts: [contract] }),
    check: () => lease.check(),
  })
}
