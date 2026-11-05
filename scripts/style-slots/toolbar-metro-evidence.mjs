import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evidenceSource } from './evidence-source.mjs'

export const toolbarMetroScope = 'metro-production-toolbar-owner-host-standins'
const modes = ['ordinary', 'opt-in', 'budget-fallback', 'toolbar-opt-in']
const hash = /^[a-f0-9]{64}$/

// This is a bounded receipt check, not another owner audit or an admission
// decision. Expected styles are independent of the generated owner contract.
export function assessToolbarMetroEvidence(receipt, sourceCommit, manifestSha256) {
  const base = { scope: toolbarMetroScope, owner: 'Toolbar.root', sourceCommit }
  try {
    assert.match(sourceCommit, /^[a-f0-9]{40}$/)
    assert.match(manifestSha256, hash)
    assert.equal(receipt?.schema, 2)
    assert.equal(receipt.scope, toolbarMetroScope)
    assert.equal(receipt.sourceCommit, sourceCommit)
    assert.equal(receipt.manifestSha256, manifestSha256)
    assert.equal(receipt.trackedChanges, false)
    assert.equal(receipt.passed, true)
    assert.equal(Object.hasOwn(receipt, 'error'), false)
    assert.equal(receipt.builds?.length, 8)
    const pending = new Set(['android', 'ios'].flatMap((p) => modes.map((m) => `${p}:${m}`)))
    for (const row of receipt.builds) {
      assert.ok(pending.delete(`${row.platform}:${row.mode}`), 'Unexpected or duplicate build')
      assert.equal(row.inputPlatform, row.platform)
      assert.match(row.bundleSha256, hash)
      assert.ok(Number.isSafeInteger(row.bundleBytes) && row.bundleBytes > 0)
      assert.equal(row.sharedAliasPlan, row.mode === 'toolbar-opt-in')
      assert.equal(row.capture?.source, 'ordinary-metro-resolver')
      assert.match(row.capture.fingerprint, hash)
      assert.ok(
        Number.isSafeInteger(row.capture.routes) &&
          row.capture.routes > 0 &&
          row.capture.routes <= 512,
      )
      const ordinary = receipt.builds.find(
        (r) => r.platform === row.platform && r.mode === 'ordinary',
      )
      assert.equal(row.capture.ordinaryBundleSha256, ordinary?.bundleSha256)
      assert.deepEqual(
        row.capture,
        ordinary?.capture,
        'Builds must share the successful ordinary capture',
      )
      assert.deepEqual(Object.keys(row.routes).sort(), ['alias', 'literal', 'opaque', 'uncaptured'])
      for (const [route, observed] of Object.entries(row.routes)) {
        assert.deepEqual(
          observed,
          {
            carrierSupplied: row.mode === 'toolbar-opt-in' && ['literal', 'alias'].includes(route),
            style: {
              paddingTop: 21,
              paddingRight: 14,
              paddingBottom: 14,
              paddingLeft: 14,
              rowGap: 5,
              columnGap: 21,
            },
            role: 'toolbar',
            label: 'Tools',
            privateLeak: false,
            itemKeys: [],
            runtimeReads: route === 'opaque' ? 1 : 0,
            authorReads: 1,
            actions: 1,
          },
          `${row.platform}/${row.mode}/${route}`,
        )
      }
    }
    assert.equal(pending.size, 0)
    return { ...base, passed: true, builds: 8, observations: 32, prepared: 4, ordinary: 28 }
  } catch (error) {
    return { ...base, passed: false, reason: error.message }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = evidenceSource()
  const manifest = readFileSync(
    new URL('../../packages/patterns/hozo.manifest.json', import.meta.url),
  )
  const receipt = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const result = assessToolbarMetroEvidence(
    receipt,
    source.sourceCommit,
    createHash('sha256').update(manifest).digest('hex'),
  )
  if (source.trackedChanges) {
    result.passed = false
    result.reason = 'Assessment checkout has tracked source changes'
  }
  console.log(JSON.stringify(result, null, 2))
  if (!result.passed) process.exitCode = 1
}
