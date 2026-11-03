// Bounded delivery evidence. Live detents do not establish the whole event ABI.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOwnerPackageShadow } from '../../packages/compiler/src/owner-package.ts'
import { evidenceSource } from './evidence-source.mjs'
import { auditOwnerInputs } from './owner-input-audit.mjs'

const owner = 'BottomSheet.handle'

export function assessHandleDelivery({
  sourceCommit,
  trackedChanges,
  manifestText,
  nativeHandle,
  webHandle,
}) {
  const base = {
    schema: 1,
    scope: 'published-handle-live-detent-delivery',
    owner,
    sourceCommit,
    trackedChanges,
  }
  try {
    const manifest = parseOwnerPackageShadow(manifestText)
    const contract = manifest.owners?.contracts.find((row) => row.owner === owner)
    assert.ok(contract)
    for (const name of ['BottomSheet', 'HozoBottomSheet'])
      assert.ok(manifest.exports.some((row) => row.name === name && row.owners.includes(owner)))
    assert.equal(contract.classProp, 'handleClassName')
    assert.deepEqual(contract.abi, {
      nativePreparedProp: 'hozoHandleStyle',
      webClassProp: 'handleClassName',
    })
    assert.deepEqual(contract.authoredStyles, [{ prop: 'handleStyle', order: 0 }])
    assert.deepEqual(contract.bindings, ['present', 'resizable'])
    assert.deepEqual(
      contract.shapes.map(({ id, when, nativeHost, webHost }) => ({
        id,
        when,
        nativeHost,
        webHost,
      })),
      [
        {
          id: 'resizable',
          when: { all: [{ eq: ['present', true] }, { eq: ['resizable', true] }] },
          nativeHost: 'Pressable',
          webHost: 'button',
        },
        {
          id: 'decorative',
          when: { all: [{ eq: ['present', true] }, { eq: ['resizable', false] }] },
          nativeHost: 'View',
          webHost: 'div',
        },
      ],
    )
    const manifestSha256 = createHash('sha256').update(manifestText).digest('hex')
    for (const [receipt, platform] of [
      [nativeHandle, 'ios'],
      [webHandle, 'web'],
    ]) {
      assert.equal(
        receipt?.aliasesSameOwner,
        true,
        'Both public aliases must share the mounted Owner',
      )
      assert.equal(receipt.prepared?.preparations, 1)
      const identity = receipt.prepared.identity
      assert.equal(identity.owner, owner)
      assert.equal(identity.platform, platform)
      assert.equal(identity.specifier, '@hozo/patterns')
      assert.equal(identity.imported, 'BottomSheet')
      assert.equal(identity.classProp, contract.classProp)
      assert.equal(identity.manifestSha256, manifestSha256, 'Evidence refers to another manifest')
    }
    assert.equal(trackedChanges, false)
    const inputDomain = auditOwnerInputs({
      sourceCommit,
      trackedChanges,
      nativeHandle,
      webHandle,
    }).domains.find((domain) => domain.owner === owner)
    assert.equal(inputDomain.status, 'measured', inputDomain.reason)
    return { ...base, passed: true, manifestSha256, inputDomain, rollout: 'unchanged' }
  } catch (error) {
    return { ...base, passed: false, reason: error.message, rollout: 'unchanged' }
  }
}

const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.join(root, 'artifacts/style-fact-model')
  const read = (name) => {
    try {
      return JSON.parse(readFileSync(path.join(directory, name), 'utf8'))
    } catch {
      return null
    }
  }
  const report = assessHandleDelivery({
    ...evidenceSource(),
    manifestText: readFileSync(path.join(root, 'packages/patterns/hozo.manifest.json'), 'utf8'),
    nativeHandle: read('handle-inputs-native.json'),
    webHandle: read('handle-inputs-browser.json'),
  })
  mkdirSync(directory, { recursive: true })
  const json = JSON.stringify(report, null, 2)
  writeFileSync(path.join(directory, 'handle-contract-assessment.json'), `${json}\n`)
  console.log(json)
  if (!report.passed) process.exitCode = 1
}
