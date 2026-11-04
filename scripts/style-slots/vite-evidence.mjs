import assert from 'node:assert/strict'

export const viteCapturedScope = 'vite-source-observed-real-owner-browser'
export const viteFallbackScope = 'vite-ordinary-fallback-real-owner-browser'
export const vitePhases = {
  tabs: ['initial', 'selected', 'author', 'removed', 'before-sheet-removal', 'sheet-removed'],
  decoration: ['rest', 'author', 'removed', 'before-sheet-removal', 'sheet-removed'],
  resizable: [
    'rest',
    'hover',
    'focus',
    'author',
    'removed',
    'before-sheet-removal',
    'sheet-removed',
  ],
}
export const viteComparableRows = Object.values(vitePhases).reduce(
  (total, phases) => total + phases.length - 1,
  0,
)

const digest = /^[a-f0-9]{64}$/
const includesWidgets = (modules) =>
  ['bottom-sheet.js', 'tabs.js'].every((file) =>
    modules?.some((module) => module.replaceAll('\\', '/').endsWith(`/patterns/dist/${file}`)),
  )

// Recheck the evidence matrix, not just the runner's passed flag. This
// compares measured rows, not CSS syntax or general Vite coverage.
export function assessViteEvidence(receipt, manifestSha256) {
  const base = { scope: receipt.scope, sourceCommit: receipt.sourceCommit }
  try {
    assert.equal(receipt.trackedChanges, false)
    assert.match(receipt.sourceSha256, digest)
    assert.ok(includesWidgets(receipt.modules), 'Missing actual built widgets')
    const fallback = receipt.scope === viteFallbackScope
    if (fallback) {
      const { fallbackBuild, ordinaryBuild } = receipt
      assert.equal(fallbackBuild.admission.route, 'ordinary-fallback')
      assert.equal(ordinaryBuild.admission, null)
      assert.match(fallbackBuild.entrySha256, digest)
      assert.equal(fallbackBuild.entrySha256, ordinaryBuild.entrySha256)
      assert.deepEqual(fallbackBuild.configuredPackages, ordinaryBuild.configuredPackages)
      for (const build of [fallbackBuild, ordinaryBuild]) {
        assert.equal(build.sourceSha256, receipt.sourceSha256)
        assert.deepEqual(build.owners, [])
        assert.equal(build.preparedNamespacesAbsent, true)
        assert.ok(includesWidgets(build.modules))
      }
    } else {
      assert.match(receipt.capture?.fingerprint, digest)
      assert.match(manifestSha256, digest)
      const expectedOwners = new Map([
        ['BottomSheet.handle', 2],
        ['Tabs.Tab', 1],
      ])
      for (const { identity, findings } of receipt.owners) {
        assert.equal(identity.manifestSha256, manifestSha256)
        assert.equal(identity.captureFingerprint, receipt.capture.fingerprint)
        assert.equal(identity.platform, 'web')
        assert.equal(identity.specifier, '@hozo/patterns')
        assert.equal(findings.length, expectedOwners.get(identity.owner))
        assert.ok(findings.every(({ disposition }) => disposition === 'prepared-literal'))
        expectedOwners.delete(identity.owner)
      }
      assert.equal(expectedOwners.size, 0, 'Missing prepared Vite owners')
    }
    const routes = fallback ? ['fallback', 'ordinary', 'tailwind'] : ['vite', 'tailwind']
    const keys = Object.entries(vitePhases).flatMap(([kind, phases]) =>
      routes.flatMap((route) => phases.map((phase) => `${kind}:${route}:${phase}`)),
    )
    const expected = new Set(keys)
    const rows = new Map()
    for (const { kind, route, phase, rows: value } of receipt.observations) {
      const key = `${kind}:${route}:${phase}`
      assert.ok(expected.delete(key), 'Unexpected or duplicate Vite observation')
      assert.equal(value?.length, kind === 'tabs' ? 3 : 1)
      for (const host of value) {
        assert.ok(Number.isFinite(host.padding) && Number.isFinite(host.opacity))
        assert.ok(typeof host.background === 'string' && typeof host.disabled === 'boolean')
        assert.ok(host.selected === null || typeof host.selected === 'string')
        assert.ok(typeof host.rowGap === 'string' && typeof host.columnGap === 'string')
      }
      rows.set(key, value)
    }
    assert.equal(expected.size, 0, 'Missing Vite observations')
    const controls = new Set(
      Object.keys(vitePhases).flatMap((kind) => routes.map((route) => `${kind}:${route}`)),
    )
    for (const { kind, route, sameOwner, absentStylesheetDetected } of receipt.controls) {
      assert.ok(controls.delete(`${kind}:${route}`), 'Unexpected or duplicate Vite control')
      assert.equal(sameOwner, true)
      assert.equal(absentStylesheetDetected, true)
      assert.notDeepEqual(
        rows.get(`${kind}:${route}:sheet-removed`),
        rows.get(`${kind}:${route}:before-sheet-removal`),
      )
    }
    assert.equal(controls.size, 0, 'Missing Vite controls')
    let matchedPairs = 0
    for (const [kind, phases] of Object.entries(vitePhases))
      for (const phase of phases.filter((value) => value !== 'sheet-removed'))
        for (const route of routes.filter((value) => value !== 'tailwind')) {
          assert.deepEqual(
            rows.get(`${kind}:${route}:${phase}`),
            rows.get(`${kind}:tailwind:${phase}`),
          )
          matchedPairs++
        }
    return { ...base, status: 'measured', matchedPairs, controls: receipt.controls.length }
  } catch (error) {
    return { ...base, status: 'invalid', reason: error.message }
  }
}
