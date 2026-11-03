// Bounded delivery evidence. Live detents do not establish the whole event ABI.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOwnerPackageShadow } from '../../packages/compiler/src/owner-package.ts'
import { evidenceSource } from './evidence-source.mjs'
import { auditOwnerInputs } from './owner-input-audit.mjs'
import { stylingFactStatus } from './status.mjs'

const owner = 'BottomSheet.handle'

// The outer delivery assessment validates the containing receipt and manifest.
export function assessHandlePartialDelivery(receipt) {
  const base = { scope: 'native-handle-published-partial', owner }
  try {
    const partial = receipt?.statePartial
    assert.equal(partial?.disposition, 'prepared-partial')
    assert.equal(partial.preparations, 1)
    assert.equal(partial.stylesheetSites, 1)
    assert.match(partial.contextFingerprint, /^scalar-order-v\d+:[a-f0-9]{64}$/)
    assert.deepEqual(
      partial.identity,
      receipt.stateFallback?.identity,
      'Partial and retained controls must select the same caller identity',
    )
    const { importer: _partialImporter, ...partialPackage } = partial.identity
    const { importer: _restImporter, ...restPackage } = receipt.prepared.identity
    assert.deepEqual(
      partialPackage,
      restPackage,
      'Partial evidence must share the published package capture',
    )
    assert.deepEqual(
      partial.observations.map((row) => row.platform),
      ['android', 'ios'],
    )
    for (const row of partial.observations) {
      assert.deepEqual(row.hovered, { opacity: 0.5, paddingTop: 20, rowGap: 16, resolverCalls: 0 })
      assert.ok(
        Number.isSafeInteger(row.decorative?.resolverCalls) && row.decorative.resolverCalls > 0,
      )
      assert.deepEqual(row.decorative, {
        opacity: 1,
        paddingTop: 20,
        rowGap: 16,
        resolverCalls: row.decorative.resolverCalls,
      })
      assert.deepEqual(row.restored, { opacity: 1, paddingTop: 20, rowGap: 16, resolverCalls: 0 })
    }
    return { ...base, passed: true, observations: 6, platforms: 2 }
  } catch (error) {
    return { ...base, passed: false, reason: error.message }
  }
}

export function assessHandleNativeStates(receipt, sourceCommit) {
  const base = { scope: 'native-handle-direct-carrier-states', owner }
  try {
    assert.match(sourceCommit, /^[a-f0-9]{40}$/)
    assert.equal(receipt?.schema, 1)
    assert.equal(receipt.scope, base.scope)
    assert.equal(receipt.sourceCommit, sourceCommit)
    assert.equal(receipt.trackedChanges, false)
    assert.equal(receipt.passed, true)
    const expected = []
    const events = [
      'rest',
      'onHoverIn',
      'onFocus',
      'onPressIn',
      'onPressOut',
      'onBlur',
      'onHoverOut',
    ]
    for (const interactive of [false, true])
      for (const author of ['none', 'object', 'array'])
        for (const [at, event] of (interactive ? events : ['rest']).entries()) {
          expected.push({
            interactive,
            author,
            event,
            selected: {
              host: interactive ? 'Pressable' : 'View',
              padding: at >= 2 && at <= 4 ? 12 : 8,
              opacity: author === 'object' ? 0.25 : at >= 1 && at <= 5 ? 0.5 : 1,
              background: at === 3 ? '#ff0000' : '#ffffff',
              radius: 7,
              rowGap: author === 'array' ? 6 : author === 'object' ? 16 : null,
              columnGap: author === 'array' ? 24 : author === 'object' ? 16 : null,
            },
          })
        }
    assert.deepEqual(
      receipt.observations,
      expected,
      'Missing or incorrect direct-carrier state observation',
    )
    return { ...base, passed: true, observations: expected.length }
  } catch (error) {
    return { ...base, passed: false, reason: error.message }
  }
}

export function assessHandleWebStates(receipt, sourceCommit, manifestSha256) {
  const base = { scope: 'web-handle-interaction-styles', owner }
  try {
    assert.equal(receipt?.scope, 'web-computed-style-real-pointer-focus')
    assert.equal(receipt.trackedChanges, false)
    assert.match(manifestSha256, /^[a-f0-9]{64}$/)
    assert.equal(receipt.prepared?.identity?.manifestSha256, manifestSha256)
    assert.equal(receipt.prepared.delivery, 'composed-ordinary-lowering')
    assert.equal(receipt.prepared.ordinaryParses, 1)
    const [result] = stylingFactStatus({ commit: sourceCommit, receipts: [receipt] }).observations
    assert.equal(result.status, 'measured', result.reason)
    const rest = {
      paddingTop: '16px',
      width: '32px',
      opacity: '1',
      backgroundColor: 'rgb(34, 51, 68)',
    }
    for (const { state, selected } of receipt.observations) {
      const expected = { ...rest }
      if (state === 'hover' || state === 'pressed') expected.opacity = '0.5'
      if (state === 'focus' || state === 'pressed') expected.paddingTop = '12px'
      if (state === 'pressed') expected.backgroundColor = 'rgb(255, 0, 0)'
      assert.deepEqual(selected, expected, `Unexpected computed style for ${state}`)
    }
    return { ...base, passed: true, observations: receipt.observations.length }
  } catch (error) {
    return { ...base, passed: false, reason: error.message }
  }
}

// The caller must first validate the containing Native receipt's provenance.
export function assessHandleNativeLifetime(rows) {
  const base = { scope: 'native-handle-style-lifetime-model', owner }
  try {
    const expected = []
    for (const platform of ['android', 'ios'])
      for (const route of ['opaque', 'caller'])
        for (const interactive of [false, true]) {
          const style = {
            host: interactive ? 'Pressable' : 'View',
            padding: 8,
            rowGap: 16,
            columnGap: 16,
            opacity: 1,
            background: '#ffffff',
          }
          expected.push({
            platform,
            route,
            interactive,
            opened: style,
            exiting: platform === 'ios' ? style : null,
            absentModals: 0,
            reopened: style,
            sameReopenedHost: false,
          })
        }
    assert.deepEqual(rows, expected, 'Missing or incorrect modeled Native lifetime observation')
    return { ...base, passed: true, observations: expected.length }
  } catch (error) {
    return { ...base, passed: false, reason: error.message }
  }
}

export function assessHandleWebLifetime(receipt, sourceCommit, manifestSha256) {
  const base = { scope: 'web-handle-style-lifetime', owner }
  try {
    assert.equal(receipt?.schema, 1)
    assert.equal(receipt.scope, 'web-owner-presence-controlled-clock')
    assert.equal(receipt.passed, true)
    assert.equal(receipt.trackedChanges, false)
    assert.match(sourceCommit, /^[a-f0-9]{40}$/)
    assert.match(manifestSha256, /^[a-f0-9]{64}$/)
    assert.equal(receipt.sourceCommit, sourceCommit)
    const prepared = receipt.prepared
    assert.equal(prepared.identity.owner, owner)
    assert.equal(prepared.identity.platform, 'web')
    assert.equal(prepared.identity.classProp, 'handleClassName')
    assert.equal(prepared.identity.manifestSha256, manifestSha256)
    assert.equal(prepared.delivery, 'composed-ordinary-lowering')
    assert.equal(prepared.preparations, 1)
    assert.equal(prepared.ordinaryParses, 1)
    const expected = []
    const controls = []
    for (const interactive of [false, true]) {
      const open = {
        tag: interactive ? 'BUTTON' : 'DIV',
        state: 'open',
        sameHost: true,
        inert: false,
        pointerEvents: null,
        style: {
          paddingTop: '16px',
          width: '32px',
          opacity: '1',
          backgroundColor: 'rgb(34, 51, 68)',
        },
      }
      for (const kind of ['candidate', 'tailwind', 'prepared']) {
        controls.push({ kind, interactive, retained: true })
        for (const [phase, selected] of [
          ['initial-hidden', null],
          ['open', open],
          ['exiting', { ...open, state: 'closed', inert: true, pointerEvents: 'none' }],
          ['absent', null],
          ['reopened', { ...open, sameHost: false }],
        ])
          expected.push({ kind, interactive, phase, selected })
      }
    }
    assert.deepEqual(receipt.observations, expected, 'Missing or incorrect lifecycle observation')
    assert.deepEqual(receipt.earlyExitControls, controls, 'Missing early-exit negative control')
    return {
      ...base,
      passed: true,
      observations: expected.length,
      earlyExitControls: controls.length,
    }
  } catch (error) {
    return { ...base, passed: false, reason: error.message }
  }
}

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
      nativePartial: { prop: 'hozoInteractiveHandleStyle', shape: 'resizable' },
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
  const source = evidenceSource()
  const manifestText = readFileSync(path.join(root, 'packages/patterns/hozo.manifest.json'), 'utf8')
  const nativeHandle = read('handle-inputs-native.json')
  const report = assessHandleDelivery({
    ...source,
    manifestText,
    nativeHandle,
    webHandle: read('handle-inputs-browser.json'),
  })
  report.nativeLifetime = assessHandleNativeLifetime(
    report.passed ? nativeHandle.lifetimeObservations : null,
  )
  report.webLifetime = assessHandleWebLifetime(
    read('handle-browser-lifetime.json'),
    source.sourceCommit,
    createHash('sha256').update(manifestText).digest('hex'),
  )
  report.webStates = assessHandleWebStates(
    read('handle-browser.json'),
    source.sourceCommit,
    createHash('sha256').update(manifestText).digest('hex'),
  )
  report.nativeStates = assessHandleNativeStates(
    read('handle-states-native.json'),
    source.sourceCommit,
  )
  report.nativePartial = assessHandlePartialDelivery(report.passed ? nativeHandle : null)
  report.passed &&=
    report.webLifetime.passed &&
    report.nativeLifetime.passed &&
    report.webStates.passed &&
    report.nativeStates.passed &&
    report.nativePartial.passed
  mkdirSync(directory, { recursive: true })
  const json = JSON.stringify({ ...report, scope: 'bounded-handle-delivery-evidence' }, null, 2)
  writeFileSync(path.join(directory, 'handle-contract-assessment.json'), `${json}\n`)
  console.log(json)
  if (!report.passed) process.exitCode = 1
}
