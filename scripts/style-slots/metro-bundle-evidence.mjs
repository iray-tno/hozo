import { isDeepStrictEqual } from 'node:util'

export const metroBundleScope = 'metro-production-owner-bundle-host-standins'
export const metroBundleBuilds = 4
export const metroBudgetFallbackBuilds = 2
export const metroLiveCaptureBuilds = 2

const fallbackStyle = {
  paddingTop: 21,
  paddingRight: 14,
  paddingBottom: 14,
  paddingLeft: 14,
  opacity: 1,
}

function assessOrdinaryControls(builds, key, checkInputPlatform = false) {
  if (builds.every((row) => !Object.hasOwn(row, key))) return { status: 'missing' }
  const hover = { ...fallbackStyle, opacity: 0.5 }
  if (
    !builds.every(
      ({ platform, [key]: control }) =>
        control?.carrierSupplied === false &&
        (!checkInputPlatform || control.inputPlatform === platform) &&
        control.decorativeCarrierSupplied === false &&
        isDeepStrictEqual(control.rest, fallbackStyle) &&
        isDeepStrictEqual(control.hover, hover) &&
        isDeepStrictEqual(control.fallback, fallbackStyle),
    )
  )
    return { status: 'invalid' }
  return { status: 'measured', verified: builds.length }
}

function hasHandleObservation(row) {
  return (
    /^[a-f0-9]{64}$/.test(row.bundleSha256 ?? '') &&
    isDeepStrictEqual(row.fallbackStyle, fallbackStyle) &&
    row.missingStateDiagnostic === true &&
    isDeepStrictEqual(row.hover, { opacity: 0.5, paddingTop: 21 })
  )
}

function assessLiveCaptures(builds) {
  const optIn = builds.filter((row) => row.mode === 'opt-in')
  if (optIn.every((row) => !Object.hasOwn(row, 'capture'))) return { status: 'missing' }
  const ordinaryByPlatform = new Map(
    builds.filter((row) => row.mode === 'ordinary').map((row) => [row.platform, row.bundleSha256]),
  )
  if (
    !optIn.every(
      ({ platform, capture }) =>
        capture?.source === 'ordinary-metro-resolver' &&
        /^[a-f0-9]{64}$/.test(capture.fingerprint ?? '') &&
        Number.isSafeInteger(capture.routes) &&
        capture.routes > 0 &&
        capture.routes <= 512 &&
        capture.ordinaryBundleSha256 === ordinaryByPlatform.get(platform),
    )
  )
    return { status: 'invalid' }
  return { status: 'measured', verified: optIn.length }
}

function assessBudgetFallbacks(builds) {
  if (builds === undefined) return { status: 'missing' }
  const pending = new Set(['android', 'ios'])
  if (
    !Array.isArray(builds) ||
    builds.length !== metroBudgetFallbackBuilds ||
    !builds.every(
      (row) =>
        row &&
        pending.delete(row.platform) &&
        row.mode === 'budget-fallback' &&
        row.admission?.route === 'ordinary-fallback' &&
        row.admission.reason === 'edge-budget' &&
        row.carrierSupplied === false &&
        hasHandleObservation(row),
    ) ||
    assessOrdinaryControls(builds, 'ordinaryControl', true).status !== 'measured' ||
    assessOrdinaryControls(builds, 'uncapturedControl').status !== 'measured'
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
        row.carrierSupplied !== (row.mode === 'opt-in') ||
        !hasHandleObservation(row),
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
    ordinaryControl: assessOrdinaryControls(receipt.builds, 'ordinaryControl', true),
    uncapturedControl: assessOrdinaryControls(receipt.builds, 'uncapturedControl'),
    budgetFallback: assessBudgetFallbacks(receipt.budgetFallbacks),
    liveCapture: assessLiveCaptures(receipt.builds),
  }
}
