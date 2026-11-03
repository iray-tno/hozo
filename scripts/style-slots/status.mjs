// Read-only inventories and separately scoped receipts. Never a coverage upgrade.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { components, ownerShadow } from './catalog.mjs'
import { evidenceSource } from './evidence-source.mjs'

const browserStates = ['false:rest', 'true:rest', 'true:hover', 'true:focus', 'true:pressed']
const contractScope = 'box-and-owned-label-host-delivery'

export function stylingFactStatus({
  catalog = components,
  shadow = ownerShadow,
  commit,
  receipts = [],
  trackedChanges = false,
  expectedManifestSha256,
} = {}) {
  const slots = Object.values(catalog).flat()
  const managed = slots.filter((slot) => slot.lowering === 'component-managed')
  const observations = receipts.map((receipt) =>
    assess(receipt, commit, expectedManifestSha256, trackedChanges),
  )
  const declared = shadow.contracts.filter((row) => row.audit === 'audited').map((row) => row.owner)
  const proofs = new Map(declared.map((owner) => [owner, []]))
  receipts.forEach((receipt, at) => {
    if (receipt?.scope === contractScope && proofs.has(receipt.owner))
      proofs.get(receipt.owner).push(observations[at])
  })
  const verified = declared.filter(
    (owner) =>
      !trackedChanges &&
      proofs.get(owner).length === 1 &&
      proofs.get(owner)[0].status === 'measured',
  )
  const unverified = declared.filter((owner) => !verified.includes(owner))
  const conflicting = declared.filter((owner) => proofs.get(owner).length > 1)
  const unknown = shadow.contracts.filter((row) => row.audit === 'unknown').map((row) => row.owner)
  return {
    schema: 1,
    sourceCommit: commit,
    inventory: {
      components: Object.keys(catalog).length,
      slots: slots.length,
      pendingOwners: slots.filter((slot) => slot.owner === 'pending-audit').length,
      componentManaged: managed.length,
      componentManagedPending: managed.filter((slot) => slot.owner === 'pending-audit').length,
      shadowContributions: shadow.contracts.length,
      shadowAuditUnknown: shadow.contracts.filter((contract) => contract.audit === 'unknown')
        .length,
      shadowAuditDeclared: shadow.contracts.filter((contract) => contract.audit === 'audited')
        .length,
    },
    globalMeasures: {
      coverage: null,
      fidelity: null,
      diagnosed: null,
      contractAudit: null,
      reason:
        'No complete pinned feature/diagnostic/audit denominator is established by these inventories.',
    },
    observations,
    contractEvidence: {
      scope: 'selected-shadow-contracts-not-global-coverage',
      declaredOwners: declared,
      verifiedOwners: verified,
      unverifiedDeclaredOwners: unverified,
      conflictingOwners: conflicting,
      unknownOwners: unknown,
      counts: {
        declared: declared.length,
        verified: verified.length,
        unverified: unverified.length,
        conflicting: conflicting.length,
        unknown: unknown.length,
      },
    },
    rollout: 'not-established-by-this-report',
  }
}

function assess(receipt, commit, expectedManifestSha256, trackedChanges) {
  if (!receipt) return { status: 'missing' }
  const base = { scope: receipt.scope, sourceCommit: receipt.sourceCommit }
  if (receipt.trackedChanges === true) return { ...base, status: 'uncommitted' }
  if (receipt.schema !== 1 || !/^[a-f0-9]{40}$/.test(receipt.sourceCommit ?? ''))
    return { ...base, status: 'invalid', reason: 'Missing compatible schema/source identity' }
  if (!commit || receipt.sourceCommit !== commit) return { ...base, status: 'stale' }
  if (receipt.passed !== true) return { ...base, status: 'failed' }
  if (receipt.scope === 'bounded-handle-delivery-evidence') {
    const domains = [
      ['webLifetime', 'web-handle-style-lifetime', 30],
      ['nativeLifetime', 'native-handle-style-lifetime-model', 8],
      ['webStates', 'web-handle-interaction-styles', 15],
      ['nativeStates', 'native-handle-direct-carrier-states', 24],
      ['nativePartial', 'native-handle-published-partial', 6],
    ]
    const owner = 'BottomSheet.handle'
    if (
      trackedChanges ||
      receipt.trackedChanges !== false ||
      receipt.owner !== owner ||
      receipt.rollout !== 'unchanged' ||
      !/^[a-f0-9]{64}$/.test(expectedManifestSha256 ?? '') ||
      receipt.manifestSha256 !== expectedManifestSha256 ||
      receipt.inputDomain?.owner !== owner ||
      receipt.inputDomain.status !== 'measured' ||
      receipt.inputDomain.inputCases !== 9 ||
      receipt.inputDomain.nativeObservations !== 36 ||
      receipt.inputDomain.webObservations !== 27 ||
      receipt.webLifetime?.earlyExitControls !== 6 ||
      receipt.nativePartial?.platforms !== 2 ||
      domains.some(([key, scope, count]) => {
        const row = receipt[key]
        return (
          row?.scope !== scope ||
          row.owner !== owner ||
          row.passed !== true ||
          row.observations !== count
        )
      })
    )
      return { ...base, status: 'invalid', reason: 'Incomplete current bounded handle evidence' }
    return {
      ...base,
      status: 'measured',
      owner,
      manifestSha256: receipt.manifestSha256,
      domains: domains.map(([key, scope, observations]) => ({ key, scope, observations })),
      liveDetents: { cases: 9, nativeObservations: 36, webObservations: 27 },
      denominatorKind:
        'bounded handle delivery; direct-carrier states and published partial transitions are separate',
    }
  }
  if (receipt.scope === contractScope) {
    if (
      receipt.owner !== 'Tabs.Tab' ||
      receipt.trackedChanges !== false ||
      receipt.assessment !== 'host-delivery-verified' ||
      JSON.stringify(receipt.rungs) !== '[1,2,3]' ||
      receipt.declaredAudit !== 'audited' ||
      !/^[a-f0-9]{64}$/.test(expectedManifestSha256 ?? '') ||
      receipt.manifestSha256 !== expectedManifestSha256 ||
      receipt.inputDomain?.status !== 'measured' ||
      receipt.inputDomain.owner !== receipt.owner ||
      receipt.declarationGate?.passed !== true ||
      receipt.declarationGate.scope !== 'declared-audited-shadow-contracts' ||
      !Array.isArray(receipt.declarationGate.verifiedOwners) ||
      !receipt.declarationGate.verifiedOwners.includes(receipt.owner) ||
      new Set(receipt.declarationGate.verifiedOwners).size !==
        receipt.declarationGate.verifiedOwners.length ||
      !Array.isArray(receipt.fidelity?.limits) ||
      receipt.fidelity.limits.some((limit) => typeof limit !== 'string')
    )
      return {
        ...base,
        status: 'invalid',
        reason: 'Missing current scoped host-contract proof/provenance',
      }
    return {
      ...base,
      status: 'measured',
      owner: receipt.owner,
      manifestSha256: receipt.manifestSha256,
      rungs: receipt.rungs,
      fidelityLimits: receipt.fidelity.limits,
      denominatorKind: 'one independently assessed shadow host/ABI contract, not all public owners',
    }
  }
  if (receipt.scope === 'web-computed-style-real-pointer-focus') {
    const kinds = ['candidate', 'tailwind']
    if (Object.hasOwn(receipt, 'prepared')) {
      const prepared = receipt.prepared
      if (
        prepared?.identity?.owner !== 'BottomSheet.handle' ||
        prepared.identity.platform !== 'web' ||
        prepared.identity.classProp !== 'handleClassName' ||
        !/^[a-f0-9]{64}$/.test(prepared.identity.manifestSha256 ?? '') ||
        typeof prepared.fingerprint !== 'string' ||
        !prepared.fingerprint ||
        prepared.preparations !== 1 ||
        ((Object.hasOwn(prepared, 'delivery') || Object.hasOwn(prepared, 'ordinaryParses')) &&
          (prepared.delivery !== 'composed-ordinary-lowering' || prepared.ordinaryParses !== 1))
      )
        return { ...base, status: 'invalid', reason: 'Missing prepared-owner provenance' }
      kinds.push('prepared')
      const controls = receipt.controls
      if (
        !Array.isArray(controls) ||
        controls.length !== kinds.length * 2 ||
        controls.some(
          (row) =>
            !row ||
            !kinds.includes(row.kind) ||
            typeof row.interactive !== 'boolean' ||
            row.absentStylesheetDetected !== true,
        ) ||
        new Set(controls.map((row) => `${row.kind}:${row.interactive}`)).size !== kinds.length * 2
      )
        return { ...base, status: 'invalid', reason: 'Missing prepared-browser negative controls' }
    }
    const rows = receipt.observations
    if (!Array.isArray(rows) || rows.length !== browserStates.length * kinds.length)
      return { ...base, status: 'invalid', reason: 'Missing/duplicate browser observations' }
    const selected = new Map()
    for (const row of rows) {
      if (!row || typeof row !== 'object')
        return { ...base, status: 'invalid', reason: 'Invalid browser observation' }
      const key = `${row.kind}:${row.interactive}:${row.state}`
      if (
        !kinds.includes(row.kind) ||
        typeof row.interactive !== 'boolean' ||
        !browserStates.includes(`${row.interactive}:${row.state}`) ||
        selected.has(key) ||
        !row.selected ||
        !['paddingTop', 'width', 'opacity', 'backgroundColor'].every(
          (key) => typeof row.selected[key] === 'string',
        )
      )
        return { ...base, status: 'invalid', reason: 'Invalid browser observation identity/value' }
      selected.set(key, row.selected)
    }
    for (const state of browserStates) {
      const oracle = selected.get(`tailwind:${state}`)
      for (const kind of kinds.filter((kind) => kind !== 'tailwind')) {
        const candidate = selected.get(`${kind}:${state}`)
        if (
          !candidate ||
          !oracle ||
          !Object.keys(candidate).every((key) => candidate[key] === oracle[key])
        )
          return { ...base, status: 'invalid', reason: 'Browser pair does not match' }
      }
    }
    return {
      ...base,
      status: 'measured',
      matchedPairs: browserStates.length * (kinds.length - 1),
      denominator: browserStates.length * (kinds.length - 1),
      denominatorKind:
        'explicit Web handle state/property fixture, not all Tailwind/Native support',
    }
  }
  if (receipt.scope === 'explicit-component-bundle-react-native-peers-external') {
    const rows = receipt.measurements
    if (
      !Array.isArray(rows) ||
      rows.length !== 2 ||
      rows[0].mode !== 'opaque' ||
      rows[1].mode !== 'prepared' ||
      !rows.every(
        (row) =>
          Number.isSafeInteger(row.bytes) &&
          row.bytes > 0 &&
          Number.isSafeInteger(row.gzipBytes) &&
          row.gzipBytes > 0 &&
          /^[a-f0-9]{64}$/.test(row.sha256 ?? ''),
      )
    )
      return { ...base, status: 'invalid', reason: 'Incomplete component bundle measurements' }
    return {
      ...base,
      status: 'measured',
      delta: {
        bytes: rows[1].bytes - rows[0].bytes,
        gzipBytes: rows[1].gzipBytes - rows[0].gzipBytes,
      },
      denominatorKind: 'one component bundle with external peers, not an application size budget',
    }
  }
  return { ...base, status: 'invalid', reason: 'Unrecognized evidence scope' }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const output = args[0] === '--output' ? args.splice(0, 2)[1] : undefined
  if (process.argv[2] === '--output' && !output) throw new Error('--output needs a file path')
  const receipts = args.map((file) =>
    existsSync(file) ? JSON.parse(readFileSync(path.resolve(file), 'utf8')) : null,
  )
  const source = evidenceSource()
  const expectedManifestSha256 = createHash('sha256')
    .update(readFileSync(new URL('../../packages/patterns/hozo.manifest.json', import.meta.url)))
    .digest('hex')
  const report = {
    ...stylingFactStatus({
      commit: source.sourceCommit,
      trackedChanges: source.trackedChanges,
      expectedManifestSha256,
      receipts,
    }),
    trackedChanges: source.trackedChanges,
    inputs: args,
  }
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (output) {
    mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
    writeFileSync(path.resolve(output), text)
  } else console.log(text.trimEnd())
}
