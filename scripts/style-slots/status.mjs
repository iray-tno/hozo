// Read-only inventories and separately scoped receipts. Never a coverage upgrade.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { components, ownerShadow } from './catalog.mjs'
import { evidenceSource } from './evidence-source.mjs'

const browserStates = ['false:rest', 'true:rest', 'true:hover', 'true:focus', 'true:pressed']

export function stylingFactStatus({
  catalog = components,
  shadow = ownerShadow,
  commit,
  receipts = [],
} = {}) {
  const slots = Object.values(catalog).flat()
  const managed = slots.filter((slot) => slot.lowering === 'component-managed')
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
    },
    globalMeasures: {
      coverage: null,
      fidelity: null,
      diagnosed: null,
      contractAudit: null,
      reason:
        'No complete pinned feature/diagnostic/audit denominator is established by these inventories.',
    },
    observations: receipts.map((receipt) => assess(receipt, commit)),
    rollout: 'not-established-by-this-report',
  }
}

function assess(receipt, commit) {
  if (!receipt) return { status: 'missing' }
  const base = { scope: receipt.scope, sourceCommit: receipt.sourceCommit }
  if (receipt.trackedChanges === true) return { ...base, status: 'uncommitted' }
  if (receipt.schema !== 1 || !/^[a-f0-9]{40}$/.test(receipt.sourceCommit ?? ''))
    return { ...base, status: 'invalid', reason: 'Missing compatible schema/source identity' }
  if (!commit || receipt.sourceCommit !== commit) return { ...base, status: 'stale' }
  if (receipt.passed !== true) return { ...base, status: 'failed' }
  if (receipt.scope === 'web-computed-style-real-pointer-focus') {
    const rows = receipt.observations
    if (!Array.isArray(rows) || rows.length !== browserStates.length * 2)
      return { ...base, status: 'invalid', reason: 'Missing/duplicate browser observations' }
    const selected = new Map()
    for (const row of rows) {
      const key = `${row.kind}:${row.interactive}:${row.state}`
      if (
        !['candidate', 'tailwind'].includes(row.kind) ||
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
      const candidate = selected.get(`candidate:${state}`),
        oracle = selected.get(`tailwind:${state}`)
      if (
        !candidate ||
        !oracle ||
        !Object.keys(candidate).every((key) => candidate[key] === oracle[key])
      )
        return { ...base, status: 'invalid', reason: 'Browser pair does not match' }
    }
    return {
      ...base,
      status: 'measured',
      matchedPairs: browserStates.length,
      denominator: browserStates.length,
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
  const report = {
    ...stylingFactStatus({ commit: source.sourceCommit, receipts }),
    trackedChanges: source.trackedChanges,
    inputs: args,
  }
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (output) {
    mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
    writeFileSync(path.resolve(output), text)
  } else console.log(text.trimEnd())
}
