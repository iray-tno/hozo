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
