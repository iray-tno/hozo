import { isDeepStrictEqual } from 'node:util'

export const metroBundleScope = 'metro-production-owner-bundle-host-standins'
export const metroBundleBuilds = 4

const fallbackStyle = {
  paddingTop: 21,
  paddingRight: 14,
  paddingBottom: 14,
  paddingLeft: 14,
  opacity: 1,
}

function assessOrdinaryControls(builds) {
  if (builds.every((row) => !Object.hasOwn(row, 'ordinaryControl'))) return { status: 'missing' }
  const hover = { ...fallbackStyle, opacity: 0.5 }
  if (
    !builds.every(
      ({ platform, ordinaryControl: control }) =>
        control?.inputPlatform === platform &&
        control.carrierSupplied === false &&
        control.decorativeCarrierSupplied === false &&
        isDeepStrictEqual(control.rest, fallbackStyle) &&
        isDeepStrictEqual(control.hover, hover) &&
        isDeepStrictEqual(control.fallback, fallbackStyle),
    )
  )
    return { status: 'invalid' }
  return { status: 'measured', verified: builds.length }
}

export function assessMetroBundleEvidence(receipt, expectedManifestSha256) {
  const base = { scope: metroBundleScope, sourceCommit: receipt.sourceCommit }
  const pending = new Set(['android:opt-in', 'android:ordinary', 'ios:opt-in', 'ios:ordinary'])
  if (
    receipt.trackedChanges !== false ||
    !/^[a-f0-9]{64}$/.test(expectedManifestSha256 ?? '') ||
    receipt.manifestSha256 !== expectedManifestSha256 ||
    !Array.isArray(receipt.builds) ||
    receipt.builds.length !== metroBundleBuilds ||
    receipt.builds.some(
      (row) =>
        !row ||
        !pending.delete(`${row.platform}:${row.mode}`) ||
        !/^[a-f0-9]{64}$/.test(row.bundleSha256 ?? '') ||
        row.carrierSupplied !== (row.mode === 'opt-in') ||
        !isDeepStrictEqual(row.fallbackStyle, fallbackStyle) ||
        row.missingStateDiagnostic !== true ||
        !isDeepStrictEqual(row.hover, { opacity: 0.5, paddingTop: 21 }),
    ) ||
    pending.size !== 0
  ) {
    return { ...base, status: 'invalid', reason: 'Incomplete or mismatched Metro bundle evidence' }
  }
  return {
    ...base,
    status: 'measured',
    owner: 'BottomSheet.handle',
    manifestSha256: receipt.manifestSha256,
    bundleBuilds: metroBundleBuilds,
    ordinaryControl: assessOrdinaryControls(receipt.builds),
  }
}
