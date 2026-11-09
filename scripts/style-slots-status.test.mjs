import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ownerShadow } from './style-slots/catalog.mjs'
import {
  assessHandleDelivery,
  assessHandleNativeLifetime,
  assessHandlePartialDelivery,
  assessHandleWebLifetime,
} from './style-slots/handle-contract-assessment.mjs'
import { metroBundleScope } from './style-slots/metro-bundle-evidence.mjs'
import { auditOwnerInputs } from './style-slots/owner-input-audit.mjs'
import {
  expectedIdleTabInputs,
  expectedTabContainer,
  expectedTabLabels,
  expectedTabModality,
  handleInputCases,
  tabContainerCases,
  tabInputCases,
  tabLabelCases,
  tabModalityCases,
} from './style-slots/owner-input-cases.mjs'
import { stylingFactStatus } from './style-slots/status.mjs'
import { renderStylingFactSummary } from './style-slots/status-summary.mjs'
import {
  assessDeclaredAudits,
  assessTabsContract,
  tabsDeclaration,
} from './style-slots/tabs-contract-audit.mjs'
import { expectedTabRows, tabLabelClasses, tabPhases } from './style-slots/tabs-probe.mjs'
import {
  assessToolbarMetroEvidence,
  toolbarMetroScope,
} from './style-slots/toolbar-metro-evidence.mjs'
import { viteCapturedScope, viteFallbackScope, vitePhases } from './style-slots/vite-evidence.mjs'

const commit = 'a'.repeat(40)

test('Toolbar Metro receipts require current source, all routes and negative controls without audit promotion', () => {
  // Synthetic receipts exercise the reader, not the Metro production claim.
  const hash = 'b'.repeat(64)
  const receipt = {
    schema: 6,
    scope: toolbarMetroScope,
    sourceCommit: commit,
    manifestSha256: hash,
    passed: true,
    trackedChanges: false,
    builds: ['android', 'ios'].flatMap((platform) =>
      ['ordinary', 'opt-in', 'budget-fallback', 'toolbar-opt-in'].map((mode) => ({
        platform,
        mode,
        inputPlatform: platform,
        bundleSha256: hash,
        bundleBytes: 100,
        sharedAliasPlan: mode === 'toolbar-opt-in',
        nestedCaptured: true,
        listCaptured: true,
        listControl: {
          host: 'FlatList',
          style: { paddingTop: 14, paddingRight: 14, paddingBottom: 14, paddingLeft: 14 },
          dataLength: 1,
          authorDeferred: true,
          classNameLeaked: false,
        },
        groupedControl: {
          host: 'FlatList',
          style: { paddingTop: 84, paddingRight: 42, paddingBottom: 14, paddingLeft: 14 },
          dataLength: 1,
          authorDeferred: true,
          evaluationOrder: ['before', 'callback', 'after'],
          classNameLeaked: false,
        },
        ordinaryPrimitive: {
          host: 'View',
          style: { paddingTop: 14, paddingRight: 14, paddingBottom: 14, paddingLeft: 14 },
          classNameLeaked: false,
        },
        capture: {
          source: 'ordinary-metro-resolver',
          fingerprint: hash,
          routes: 4,
          ordinaryBundleSha256: hash,
        },
        routes: Object.fromEntries(
          [
            'literal',
            'alias',
            'nested',
            'opaque',
            'renderItem',
            'groupedRenderItem',
            'uncaptured',
          ].map((route) => [
            route,
            {
              carrierSupplied:
                mode === 'toolbar-opt-in' &&
                ['literal', 'alias', 'nested', 'renderItem', 'groupedRenderItem'].includes(route),
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
          ]),
        ),
      })),
    ),
  }
  assert.deepEqual(assessToolbarMetroEvidence(receipt, commit, hash), {
    scope: toolbarMetroScope,
    owner: 'Toolbar.root',
    sourceCommit: commit,
    passed: true,
    builds: 8,
    observations: 56,
    prepared: 10,
    ordinary: 46,
    primitiveControls: 8,
    listControls: 8,
    groupedControls: 8,
  })
  const mutations = [
    (r) => {
      r.schema = 5
    },
    (r) => {
      r.builds[3].routes.groupedRenderItem.carrierSupplied = false
    },
    (r) => {
      r.builds[0].routes.groupedRenderItem.carrierSupplied = true
    },
    (r) => {
      r.builds[3].groupedControl.evaluationOrder = ['callback', 'before', 'after']
    },
    (r) => {
      r.builds[3].groupedControl.evaluationOrder.push('after')
    },
    (r) => {
      r.builds[3].groupedControl.authorDeferred = false
    },
    (r) => {
      r.builds[3].groupedControl.style.paddingLeft = 35
    },
    (r) => {
      r.schema = 4
    },
    (r) => {
      r.builds[3].listCaptured = false
    },
    (r) => {
      r.builds[3].listControl.authorDeferred = false
    },
    (r) => {
      r.builds[3].listControl.host = 'View'
    },
    (r) => {
      r.builds[3].listControl.classNameLeaked = true
    },
    (r) => {
      r.builds[3].routes.renderItem.carrierSupplied = false
    },
    (r) => {
      r.builds[0].routes.renderItem.carrierSupplied = true
    },
    (r) => {
      r.builds[3].nestedCaptured = false
    },
    (r) => {
      r.schema = 3
    },
    (r) => {
      r.builds[3].routes.nested.carrierSupplied = false
    },
    (r) => {
      delete r.builds[3].routes.nested
    },
    (r) => {
      r.builds[3].ordinaryPrimitive.classNameLeaked = true
    },
    (r) => {
      r.builds[3].ordinaryPrimitive.style.paddingTop = 0
    },
    (r) => {
      r.schema = 1
    },
    (r) => {
      r.builds[3].sharedAliasPlan = false
    },
    (r) => {
      r.builds[0].sharedAliasPlan = true
    },
    (r) => {
      r.builds[3].routes.alias.carrierSupplied = false
    },
    (r) => {
      r.sourceCommit = 'c'.repeat(40)
    },
    (r) => {
      r.manifestSha256 = 'c'.repeat(64)
    },
    (r) => {
      r.trackedChanges = true
    },
    (r) => {
      r.passed = false
    },
    (r) => {
      r.error = 'retained failure'
    },
    (r) => {
      r.scope = 'device'
    },
    (r) => {
      r.builds.pop()
    },
    (r) => {
      r.builds[1] = structuredClone(r.builds[0])
    },
    (r) => {
      r.builds[3].capture.fingerprint = 'c'.repeat(64)
    },
    (r) => {
      r.builds[3].capture.ordinaryBundleSha256 = 'c'.repeat(64)
    },
    (r) => {
      r.builds[3].inputPlatform = 'web'
    },
    (r) => {
      r.builds[3].bundleSha256 = 'missing'
    },
    (r) => {
      r.builds[3].bundleBytes = 0
    },
    (r) => {
      r.builds[3].capture.routes = 513
    },
    (r) => {
      r.builds[3].routes.literal.carrierSupplied = false
    },
    (r) => {
      r.builds[3].routes.opaque.carrierSupplied = true
    },
    (r) => {
      r.builds[3].routes.uncaptured.carrierSupplied = true
    },
    (r) => {
      delete r.builds[3].routes.uncaptured
    },
    ...['privateLeak', 'authorReads', 'runtimeReads', 'actions', 'role', 'itemKeys', 'style'].map(
      (key) => (r) => {
        r.builds[3].routes.opaque[key] = null
      },
    ),
  ]
  for (const mutate of mutations) {
    const copy = structuredClone(receipt)
    mutate(copy)
    assert.equal(assessToolbarMetroEvidence(copy, commit, hash).passed, false)
  }
  assert.equal(assessToolbarMetroEvidence(null, commit, hash).passed, false)
})

test('Metro denominator requires all four current platform/route builds and their observations', () => {
  const hash = 'b'.repeat(64)
  const receipt = {
    schema: 1,
    scope: metroBundleScope,
    passed: true,
    trackedChanges: false,
    sourceCommit: commit,
    manifestSha256: hash,
    builds: ['android', 'ios'].flatMap((platform) =>
      ['opt-in', 'ordinary'].map((mode) => ({
        platform,
        mode,
        bundleSha256: hash,
        carrierSupplied: mode === 'opt-in',
        fallbackStyle: {
          paddingTop: 21,
          paddingRight: 14,
          paddingBottom: 14,
          paddingLeft: 14,
          opacity: 1,
        },
        missingStateDiagnostic: true,
        hover: { opacity: 0.5, paddingTop: 21 },
      })),
    ),
  }
  const row = (receipts, trackedChanges = false, id = 'metro-bottom-sheet-production-bundle') =>
    stylingFactStatus({
      commit,
      expectedManifestSha256: hash,
      receipts,
      trackedChanges,
    }).scopedDenominators.find((entry) => entry.id === id)

  assert.equal(row([receipt]).verified, 4)
  assert.equal(row([]).status, 'missing')
  assert.equal(row([receipt, receipt]).status, 'conflicting')
  assert.equal(row([receipt], true).status, 'uncommitted')
  assert.equal(row([{ ...receipt, sourceCommit: 'c'.repeat(40) }]).status, 'stale')
  assert.equal(row([{ ...receipt, passed: false }]).status, 'failed')
  for (const [field, value] of [
    ['carrierSupplied', false],
    ['bundleSha256', 'not a hash'],
    ['missingStateDiagnostic', false],
    ['fallbackStyle', {}],
    ['hover', { opacity: 1, paddingTop: 21 }],
  ]) {
    const changed = [{ ...receipt.builds[0], [field]: value }, ...receipt.builds.slice(1)]
    assert.equal(row([{ ...receipt, builds: changed }]).status, 'invalid', field)
  }
  assert.equal(row([{ ...receipt, builds: receipt.builds.slice(1) }]).status, 'invalid')
  assert.equal(
    row([{ ...receipt, builds: [receipt.builds[1], ...receipt.builds.slice(1)] }]).status,
    'invalid',
  )
  assert.equal(row([{ ...receipt, manifestSha256: 'c'.repeat(64) }]).status, 'invalid')

  const controlRow = (value) => row([value], false, 'metro-opaque-owner-ordinary-control')
  assert.equal(controlRow(receipt).status, 'missing')
  const withControls = {
    ...receipt,
    builds: receipt.builds.map((build) => ({
      ...build,
      ordinaryControl: {
        inputPlatform: build.platform,
        carrierSupplied: false,
        decorativeCarrierSupplied: false,
        rest: build.fallbackStyle,
        hover: { ...build.fallbackStyle, opacity: 0.5 },
        fallback: build.fallbackStyle,
      },
    })),
  }
  assert.equal(controlRow(withControls).verified, 4)
  assert.equal(controlRow({ ...withControls, sourceCommit: 'c'.repeat(40) }).status, 'stale')
  for (const [field, value] of [
    ['inputPlatform', 'ios'],
    ['carrierSupplied', true],
    ['decorativeCarrierSupplied', true],
    ['rest', {}],
    ['hover', {}],
    ['fallback', {}],
  ]) {
    const [first, ...rest] = withControls.builds
    const changed = {
      ...withControls,
      builds: [
        { ...first, ordinaryControl: { ...first.ordinaryControl, [field]: value } },
        ...rest,
      ],
    }
    assert.equal(controlRow(changed).status, 'invalid', field)
    assert.equal(row([changed]).verified, 4)
  }
  assert.equal(
    controlRow({ ...withControls, builds: [receipt.builds[0], ...withControls.builds.slice(1)] })
      .status,
    'invalid',
  )
  const uncapturedRow = (value) => row([value], false, 'metro-uncaptured-owner-ordinary-control')
  assert.equal(uncapturedRow(withControls).status, 'missing')
  const withUncaptured = {
    ...withControls,
    builds: withControls.builds.map(({ ordinaryControl, ...build }) => {
      const { inputPlatform: _inputPlatform, ...uncapturedControl } = ordinaryControl
      return { ...build, ordinaryControl, uncapturedControl }
    }),
  }
  assert.equal(uncapturedRow(withUncaptured).verified, 4)
  const [first, ...otherBuilds] = withUncaptured.builds
  const leaked = {
    ...withUncaptured,
    builds: [
      { ...first, uncapturedControl: { ...first.uncapturedControl, carrierSupplied: true } },
      ...otherBuilds,
    ],
  }
  assert.equal(uncapturedRow(leaked).status, 'invalid')
  assert.equal(controlRow(leaked).verified, 4)

  const budgetRow = (value) => row([value], false, 'metro-owner-edge-budget-fallback')
  assert.equal(budgetRow(withUncaptured).status, 'missing')
  const budgetFallbacks = withUncaptured.builds
    .filter((build) => build.mode === 'ordinary')
    .map((build) => ({
      ...build,
      mode: 'budget-fallback',
      admission: { route: 'ordinary-fallback', reason: 'edge-budget' },
    }))
  const withBudget = { ...withUncaptured, budgetFallbacks }
  assert.equal(budgetRow(withBudget).verified, 2)
  const [android, ios] = budgetFallbacks
  for (const fallback of [
    [android],
    [android, android],
    [{ ...android, mode: 'ordinary' }, ios],
    [{ ...android, admission: { route: 'ordinary-fallback', reason: 'untrusted' } }, ios],
    [{ ...android, carrierSupplied: true }, ios],
    [{ ...android, missingStateDiagnostic: false }, ios],
    [{ ...android, uncapturedControl: undefined }, ios],
  ]) {
    const changed = { ...withBudget, budgetFallbacks: fallback }
    assert.equal(budgetRow(changed).status, 'invalid')
    assert.equal(row([changed]).verified, 4)
  }

  const liveRow = (value) => row([value], false, 'metro-owner-live-capture')
  assert.equal(liveRow(receipt).status, 'missing')
  const withLive = {
    ...receipt,
    builds: receipt.builds.map((build) => {
      const ordinaryBundleSha256 = (build.platform === 'android' ? 'a' : 'b').repeat(64)
      if (build.mode === 'ordinary') return { ...build, bundleSha256: ordinaryBundleSha256 }
      return {
        ...build,
        capture: {
          source: 'ordinary-metro-resolver',
          fingerprint: hash,
          routes: 8,
          ordinaryBundleSha256,
        },
      }
    }),
  }
  assert.equal(liveRow(withLive).verified, 2)
  const [optIn, ...otherLiveBuilds] = withLive.builds
  for (const capture of [
    undefined,
    { ...optIn.capture, source: 'fixture' },
    { ...optIn.capture, fingerprint: 'bad' },
    { ...optIn.capture, routes: 513 },
    { ...optIn.capture, ordinaryBundleSha256: 'b'.repeat(64) },
  ]) {
    const changed = { ...withLive, builds: [{ ...optIn, capture }, ...otherLiveBuilds] }
    assert.equal(liveRow(changed).status, 'invalid')
    assert.equal(row([changed]).verified, 4)
  }
})

test('Vite evidence counts matched cases and rejects invented or stale build receipts', () => {
  const hash = 'b'.repeat(64)
  const modules = ['pkg/patterns/dist/bottom-sheet.js', 'pkg/patterns/dist/tabs.js']
  for (const fallback of [false, true]) {
    const routes = fallback ? ['fallback', 'ordinary', 'tailwind'] : ['vite', 'tailwind']
    const phases = Object.entries(vitePhases)
    const build = {
      configuredPackages: ['owner-consumer'],
      sourceSha256: hash,
      entrySha256: hash,
      preparedNamespacesAbsent: true,
      modules,
      owners: [],
    }
    const receipt = {
      schema: 1,
      scope: fallback ? viteFallbackScope : viteCapturedScope,
      passed: true,
      trackedChanges: false,
      sourceCommit: commit,
      sourceSha256: hash,
      modules,
      capture: { fingerprint: hash },
      owners: [
        ['BottomSheet.handle', 2],
        ['Tabs.Tab', 1],
      ].map(([owner, count]) => ({
        identity: {
          owner,
          platform: 'web',
          specifier: '@hozo/patterns',
          manifestSha256: hash,
          captureFingerprint: hash,
        },
        findings: Array.from({ length: count }, () => ({ disposition: 'prepared-literal' })),
      })),
      fallbackBuild: { ...build, admission: { route: 'ordinary-fallback' } },
      ordinaryBuild: { ...build, admission: null },
      observations: phases.flatMap(([kind, names]) =>
        routes.flatMap((route) =>
          names.map((phase) => ({
            kind,
            route,
            phase,
            rows: Array.from({ length: kind === 'tabs' ? 3 : 1 }, () => ({
              padding: phase === 'sheet-removed' ? 0 : 4,
              opacity: 1,
              background: 'transparent',
              selected: null,
              disabled: false,
              rowGap: 'normal',
              columnGap: 'normal',
            })),
          })),
        ),
      ),
      controls: phases.flatMap(([kind]) =>
        routes.map((route) => ({
          kind,
          route,
          sameOwner: true,
          absentStylesheetDetected: true,
        })),
      ),
    }
    const assess = (value) =>
      stylingFactStatus({ commit, expectedManifestSha256: hash, receipts: [value] })
    const report = assess(receipt)
    assert.equal(report.observations[0].matchedPairs, fallback ? 30 : 15)
    assert.equal(
      report.scopedDenominators.find((row) => row.scope === receipt.scope).verified,
      fallback ? 30 : 15,
    )
    for (const mutate of [
      (value) => {
        value.observations[0].rows[0].padding = 7
      },
      (value) => {
        value.observations.push(value.observations[0])
      },
      (value) => {
        value.controls.pop()
      },
      (value) => {
        if (fallback) value.ordinaryBuild.entrySha256 = 'c'.repeat(64)
        else value.owners[0].identity.manifestSha256 = 'c'.repeat(64)
      },
    ]) {
      const invalid = structuredClone(receipt)
      mutate(invalid)
      assert.equal(assess(invalid).observations[0].status, 'invalid')
    }
    assert.equal(
      assess({ ...receipt, sourceCommit: 'c'.repeat(40) }).observations[0].status,
      'stale',
    )
  }
})

test('partial handle evidence requires the same capture and only decorative resolution', () => {
  const identity = {
    importer: 'state.tsx',
    manifestSha256: 'b'.repeat(64),
    captureFingerprint: 'capture',
  }
  const sample = (opacity, resolverCalls) => ({
    opacity,
    resolverCalls,
    paddingTop: 20,
    rowGap: 16,
  })
  const receipt = {
    prepared: { identity: { ...identity, importer: 'rest.tsx' } },
    stateFallback: { identity: { ...identity } },
    statePartial: {
      identity: { ...identity },
      disposition: 'prepared-partial',
      preparations: 1,
      stylesheetSites: 1,
      contextFingerprint: `scalar-order-v41:${'c'.repeat(64)}`,
      observations: ['android', 'ios'].map((platform) => ({
        platform,
        hovered: sample(0.5, 0),
        decorative: sample(1, 1),
        restored: sample(1, 0),
      })),
    },
  }
  assert.equal(assessHandlePartialDelivery(receipt).observations, 6)
  for (const mutate of [
    (v) => {
      v.statePartial.observations[0].decorative.resolverCalls = 0
    },
    (v) => {
      v.statePartial.observations[1].restored.resolverCalls = 1
    },
    (v) => {
      v.statePartial.observations[1].hovered.paddingTop = 8
    },
    (v) => {
      v.statePartial.identity.captureFingerprint = 'another'
    },
    (v) => {
      v.statePartial.stylesheetSites = 2
    },
    (v) => {
      v.statePartial.observations.pop()
    },
  ]) {
    const invalid = structuredClone(receipt)
    mutate(invalid)
    assert.equal(assessHandlePartialDelivery(invalid).passed, false)
  }
})

test('bounded handle evidence is visible without upgrading its audit declaration', () => {
  const owner = 'BottomSheet.handle'
  const manifestSha256 = 'b'.repeat(64)
  const domain = (scope, observations) => ({ scope, owner, passed: true, observations })
  const receipt = {
    schema: 1,
    scope: 'bounded-handle-delivery-evidence',
    sourceCommit: commit,
    trackedChanges: false,
    passed: true,
    owner,
    rollout: 'unchanged',
    manifestSha256,
    inputDomain: {
      owner,
      status: 'measured',
      inputCases: 9,
      nativeObservations: 36,
      webObservations: 27,
    },
    webLifetime: { ...domain('web-handle-style-lifetime', 30), earlyExitControls: 6 },
    nativeLifetime: domain('native-handle-style-lifetime-model', 8),
    webStates: domain('web-handle-interaction-styles', 15),
    nativeStates: domain('native-handle-direct-carrier-states', 24),
    nativePartial: { ...domain('native-handle-published-partial', 6), platforms: 2 },
  }
  const assess = (value, trackedChanges = false) =>
    stylingFactStatus({
      commit,
      expectedManifestSha256: manifestSha256,
      trackedChanges,
      receipts: [value],
    })
  const report = assess(receipt)
  assert.equal(report.observations[0].status, 'measured')
  const partial = report.scopedDenominators.find((row) => row.id === 'handle-native-partial')
  assert.deepEqual(partial, {
    id: 'handle-native-partial',
    scope: receipt.scope,
    platform: 'native-host-model',
    unit: 'phase/platform row',
    expected: 6,
    verified: 6,
    status: 'measured',
  })
  assert.equal(
    assess({ ...receipt, passed: false }).scopedDenominators.find((row) => row.id === partial.id)
      .verified,
    null,
  )
  assert.ok(
    report.observations[0].domains.some(
      (row) => row.key === 'nativePartial' && row.observations === 6,
    ),
  )
  assert.equal(assess({ ...receipt, nativePartial: null }).observations[0].status, 'invalid')
  assert.ok(report.contractEvidence.unknownOwners.includes(owner))
  assert.ok(!report.contractEvidence.verifiedOwners.includes(owner))
  assert.equal(report.globalMeasures.contractAudit, null)
  assert.equal(assess(receipt, true).observations[0].status, 'invalid')
  assert.equal(assess({ ...receipt, nativeStates: null }).observations[0].status, 'invalid')
  assert.equal(
    assess({ ...receipt, manifestSha256: 'c'.repeat(64) }).observations[0].status,
    'invalid',
  )
})

test('Native handle lifetime rejects early removal and reused reopening hosts', () => {
  const rows = []
  for (const platform of ['android', 'ios'])
    for (const route of ['opaque', 'caller'])
      for (const interactive of [false, true]) {
        const opened = {
          host: interactive ? 'Pressable' : 'View',
          padding: 8,
          rowGap: 16,
          columnGap: 16,
          opacity: 1,
          background: '#ffffff',
        }
        rows.push({
          platform,
          route,
          interactive,
          opened,
          exiting: platform === 'ios' ? opened : null,
          absentModals: 0,
          reopened: opened,
          sameReopenedHost: false,
        })
      }
  assert.equal(assessHandleNativeLifetime(rows).observations, 8)
  for (const mutate of [
    (value) => {
      value[4].exiting = null
    },
    (value) => {
      value[0].sameReopenedHost = true
    },
    (value) => {
      value.pop()
    },
  ]) {
    const invalid = structuredClone(rows)
    mutate(invalid)
    assert.equal(assessHandleNativeLifetime(invalid).passed, false)
  }
})

test('Web handle lifetime requires present, exiting, absent and fresh hosts on both shapes', () => {
  const manifestSha256 = 'b'.repeat(64)
  const receipt = {
    schema: 1,
    scope: 'web-owner-presence-controlled-clock',
    sourceCommit: commit,
    trackedChanges: false,
    passed: true,
    prepared: {
      identity: {
        owner: 'BottomSheet.handle',
        platform: 'web',
        classProp: 'handleClassName',
        manifestSha256,
      },
      delivery: 'composed-ordinary-lowering',
      preparations: 1,
      ordinaryParses: 1,
    },
    observations: [],
    earlyExitControls: [],
  }
  for (const interactive of [false, true])
    for (const kind of ['candidate', 'tailwind', 'prepared']) {
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
      receipt.earlyExitControls.push({ kind, interactive, retained: true })
      receipt.observations.push(
        { kind, interactive, phase: 'initial-hidden', selected: null },
        { kind, interactive, phase: 'open', selected: open },
        {
          kind,
          interactive,
          phase: 'exiting',
          selected: { ...open, state: 'closed', inert: true, pointerEvents: 'none' },
        },
        { kind, interactive, phase: 'absent', selected: null },
        { kind, interactive, phase: 'reopened', selected: { ...open, sameHost: false } },
      )
    }
  const assess = (value) => assessHandleWebLifetime(value, commit, manifestSha256)
  assert.equal(assess(receipt).observations, 30)
  for (const mutate of [
    (value) => {
      value.observations[2].selected.inert = false
    },
    (value) => {
      value.observations[4].selected.sameHost = true
    },
    (value) => {
      value.earlyExitControls.pop()
    },
    (value) => {
      value.prepared.identity.manifestSha256 = '0'.repeat(64)
    },
    (value) => {
      value.sourceCommit = '0'.repeat(40)
    },
  ]) {
    const invalid = structuredClone(receipt)
    mutate(invalid)
    assert.equal(assess(invalid).passed, false)
  }
})

test('published handle assessment binds both live matrices to the current manifest and aliases', () => {
  const manifestText = readFileSync(
    new URL('../packages/patterns/hozo.manifest.json', import.meta.url),
    'utf8',
  )
  const input = { ...inputReceipts(), trackedChanges: false, manifestText }
  for (const [receipt, platform] of [
    [input.nativeHandle, 'ios'],
    [input.webHandle, 'web'],
  ]) {
    receipt.aliasesSameOwner = true
    receipt.prepared = {
      ...receipt.prepared,
      preparations: 1,
      identity: {
        owner: 'BottomSheet.handle',
        specifier: '@hozo/patterns',
        imported: 'BottomSheet',
        classProp: 'handleClassName',
        platform,
        manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
      },
    }
  }
  const report = assessHandleDelivery(input)
  assert.equal(report.passed, true, report.reason)
  assert.equal(report.inputDomain.nativeObservations, 36)
  assert.equal(report.inputDomain.webObservations, 27)
  assert.equal(report.rungs, undefined, 'live delivery is not full contract verification')
  for (const mutate of [
    (value) => {
      value.nativeHandle.prepared.identity.manifestSha256 = '0'.repeat(64)
    },
    (value) => {
      value.webHandle.aliasesSameOwner = false
    },
    (value) => {
      value.nativeHandle.observations.pop()
    },
    (value) => {
      value.webHandle.sourceCommit = '0'.repeat(40)
    },
  ]) {
    const invalid = structuredClone(input)
    mutate(invalid)
    assert.equal(assessHandleDelivery(invalid).passed, false)
  }
})

test('Tabs proof reads the actual version-1 package envelope through the shared reader', () => {
  const text = readFileSync(
    new URL('../packages/patterns/hozo.manifest.json', import.meta.url),
    'utf8',
  )
  assert.equal(tabsDeclaration(text).owner, 'Tabs.Tab')
  const value = JSON.parse(text)
  value.package.exports.find((row) => row.name === 'HozoTabs').owners = []
  assert.throws(() => tabsDeclaration(JSON.stringify(value)), /aliases/)
  assert.throws(() => tabsDeclaration('{}'), /Invalid owner/)
})

// Synthetic fixtures verify the assessor, never stand in for actual CI receipts.
function contractInputs() {
  const value = inputReceipts()
  const routes = ['opaque', 'prepared', 'caller', 'instance']
  const kinds = ['candidate', 'tailwind', 'prepared']
  const labels = (phase) =>
    expectedTabRows(phase).map((row, at) => ({
      color: row.selected ? '#445566' : '#334455',
      size: 18,
      weight: row.disabled ? '700' : '400',
      spacing: at === 1 && phase !== 'initial' ? 1 : 0,
    }))
  const authors = (phase) =>
    expectedTabRows('selected-disabled').map((row) => ({
      rowGap: phase.startsWith('with-author') ? 5 : 3,
      columnGap: phase.startsWith('with-author') ? 7 : 2,
      background: phase.startsWith('with-author') ? '#abcdef' : row.background,
      opacity: phase.startsWith('with-author') ? 0.8 : row.opacity,
    }))
  Object.assign(value.nativeTabs, {
    aliasesSameOwner: true,
    classes: tabLabelClasses,
    declarations: ['disabled', 'aria-selected', 'aria-disabled'],
    splitText: true,
    fingerprint: 'test-context',
    instance: {
      identity: {
        owner: 'Tabs.Tab',
        classProp: 'tabClassName',
        platform: 'ios',
        manifestSha256: 'b'.repeat(64),
      },
      stylesheetSites: 1,
      contextPreparations: 1,
      contextFingerprint: 'test-context',
    },
    observations: routes.flatMap((route) =>
      tabPhases.map((phase) => ({
        route,
        phase,
        rows: expectedTabRows(phase),
        labels: labels(phase),
      })),
    ),
    authorObservations: routes.flatMap((route) =>
      ['before-author', 'with-author', 'author-removed'].map((phase) => ({
        route,
        phase,
        rows: authors(phase),
        labels: labels('selected-disabled'),
        hostEvaluationGetterReads: phase === 'with-author' ? 3 : 0,
      })),
    ),
  })
  value.webTabs.prepared.identity.classProp = 'tabClassName'
  Object.assign(value.webTabs, {
    aliasesSameOwner: true,
    observations: kinds.flatMap((kind) =>
      tabPhases.map((phase) => ({
        kind,
        phase,
        selected: expectedTabRows(phase).map((row, at) => ({
          ...row,
          color: row.selected ? 'rgb(68, 85, 102)' : 'rgb(51, 68, 85)',
          fontSize: 18,
          fontWeight: row.disabled ? '700' : '400',
          letterSpacing: at === 1 && phase !== 'initial' ? 1 : 0,
          rowGap: 3,
          columnGap: 2,
        })),
      })),
    ),
    authorObservations: kinds.flatMap((kind) =>
      ['before-author', 'with-author', 'with-author-selected-enabled', 'after-removal'].map(
        (phase) => ({ kind, phase, rows: authors(phase) }),
      ),
    ),
  })
  return {
    ...value,
    declaration: {
      ...structuredClone(ownerShadow.contracts.find((row) => row.owner === 'Tabs.Tab')),
      audit: 'unknown',
    },
    manifestSha256: 'b'.repeat(64),
    publicPropsVerified: true,
  }
}

test('Tabs contract proof checks the host ladder, not global fidelity or a default switch', () => {
  const value = contractInputs()
  const report = assessTabsContract(value)
  assert.equal(report.passed, true)
  assert.equal(report.assessment, 'host-delivery-verified')
  assert.deepEqual(report.rungs, [1, 2, 3])
  assert.equal(report.declaredAudit, 'unknown')
  assert.equal(report.fidelity.exact, false)
  assert.equal(report.rollout, 'unchanged')
  value.declaration.audit = 'audited'
  value.nativeTabs.observations = []
  assert.equal(
    assessTabsContract(value).passed,
    false,
    'a package claim cannot replace host evidence',
  )
})

test('Tabs proof refuses incomplete state/author delivery, false aliases and other manifests', () => {
  for (const mutate of [
    (v) => {
      v.publicPropsVerified = false
    },
    (v) => {
      v.declaration.shapes[0].nativeHost = 'View'
    },
    (v) => {
      v.declaration.abi.nativePreparedProp = 'hozoWrongStyle'
    },
    (v) => {
      v.nativeTabs.observations[0].rows[0].padding = 0
    },
    (v) => {
      v.nativeTabs.observations[1] = v.nativeTabs.observations[0]
    },
    (v) => {
      v.nativeTabs.observations[0].labels[0].color = '#000000'
    },
    (v) => {
      v.webTabs.observations[1].selected[1].radius = 0
    },
    (v) => {
      v.nativeTabs.authorObservations[1].rows[0].opacity = 1
    },
    (v) => {
      v.nativeTabs.authorObservations[1].hostEvaluationGetterReads = 6
    },
    (v) => {
      v.webTabs.authorObservations.pop()
    },
    (v) => {
      v.nativeTabs.instance.identity.manifestSha256 = 'c'.repeat(64)
    },
    (v) => {
      v.webTabs.prepared.identity.manifestSha256 = 'c'.repeat(64)
    },
    (v) => {
      v.nativeTabs.instance.contextFingerprint = 'another-context'
    },
    (v) => {
      v.nativeTabs.aliasesSameOwner = false
    },
    (v) => {
      v.webTabs.aliasesSameOwner = false
    },
  ]) {
    const value = contractInputs()
    mutate(value)
    assert.equal(assessTabsContract(value).passed, false)
  }
})

// Synthetic rows test the report's refusal rules only. They are not runtime
// evidence; CI's command reads the actual component/browser receipt files.
function inputReceipts() {
  const base = (scope) => ({
    schema: 1,
    scope,
    passed: true,
    sourceCommit: commit,
    trackedChanges: false,
  })
  const prepared = (owner) => ({
    identity: { owner, platform: 'web', manifestSha256: 'b'.repeat(64) },
    fingerprint: 'test-context',
    delivery: 'composed-ordinary-lowering',
    preparations: 1,
    ordinaryParses: 1,
  })
  const selected = (input, web) => ({
    host: web ? (input.interactive ? 'BUTTON' : 'DIV') : input.interactive ? 'Pressable' : 'View',
    padding: 8,
    opacity: 1,
    rowGap: 16,
    columnGap: 16,
    background: '#ffffff',
  })
  const kinds = ['candidate', 'tailwind', 'prepared']
  return {
    sourceCommit: commit,
    nativeTabs: {
      ...base('native-tabs-compiled-owner-component-host-model'),
      stylesheetCreates: 1,
      requests: { opaque: 5, prepared: 0, caller: 0, instance: 0 },
      containerObservations: ['opaque', 'prepared', 'caller', 'instance'].flatMap((route) =>
        tabContainerCases.map((input) => ({
          route,
          input: input.id,
          textHosts: input.leaves.length,
          rows: expectedTabContainer(input),
        })),
      ),
      labelObservations: ['opaque', 'prepared', 'caller', 'instance'].flatMap((route) =>
        tabLabelCases.map((input) => ({ route, input: input.id, rows: expectedTabLabels(input) })),
      ),
      modalityObservations: ['opaque', 'prepared', 'caller', 'instance'].flatMap((route) =>
        tabModalityCases.map((input) => ({
          route,
          input: input.id,
          rows: expectedTabModality(input),
        })),
      ),
      inputObservations: ['opaque', 'prepared', 'caller', 'instance'].flatMap((route) =>
        tabInputCases.map((input) => ({
          route,
          input: input.id,
          rows: expectedIdleTabInputs(input),
        })),
      ),
    },
    webTabs: {
      ...base('web-tabs-real-pointer-focus'),
      prepared: prepared('Tabs.Tab'),
      containerObservations: kinds.flatMap((kind) =>
        tabContainerCases.map((input) => ({
          kind,
          input: input.id,
          rows: expectedTabContainer(input),
        })),
      ),
      labelObservations: kinds.flatMap((kind) =>
        tabLabelCases.map((input) => ({ kind, input: input.id, rows: expectedTabLabels(input) })),
      ),
      modalityObservations: kinds.flatMap((kind) =>
        tabModalityCases.map((input) => ({
          kind,
          input: input.id,
          visible: input.visible,
          rows: expectedTabModality(input),
        })),
      ),
      controls: kinds.map((kind) => ({
        kind,
        blockedDisabledFocusAndClick: true,
        absentDisabledHooksDetected: true,
      })),
      inputObservations: kinds.flatMap((kind) =>
        tabInputCases.map((input) => ({
          kind,
          input: input.id,
          rows: expectedIdleTabInputs(input),
        })),
      ),
    },
    nativeHandle: {
      ...base('native-handle-normalized-live-input-host-model'),
      observations: ['android', 'ios'].flatMap((platform) =>
        ['opaque', 'caller'].flatMap((route) =>
          handleInputCases.map((input) => ({
            platform,
            route,
            input: input.id,
            selected: selected(input, false),
          })),
        ),
      ),
    },
    webHandle: {
      ...base('web-handle-normalized-live-inputs'),
      prepared: prepared('BottomSheet.handle'),
      controls: kinds.map((kind) => ({ kind, absentStylesheetDetected: true })),
      observations: kinds.flatMap((kind) =>
        handleInputCases.map((input, at) => ({
          kind,
          input: input.id,
          selected: selected(input, true),
          sameHost: input.interactive === (at ? handleInputCases[at - 1].interactive : false),
        })),
      ),
    },
  }
}

test('every declared audited shadow contract needs its own current independent host proof', () => {
  const input = contractInputs()
  input.declaration.audit = 'audited'
  const proof = assessTabsContract(input)
  assert.equal(proof.passed, true)
  const args = {
    contracts: structuredClone(ownerShadow.contracts),
    proofs: [proof],
    sourceCommit: commit,
    manifestSha256: 'b'.repeat(64),
  }
  const gate = assessDeclaredAudits(args)
  assert.equal(gate.passed, true)
  assert.deepEqual(gate.verifiedOwners, ['Tabs.Tab'])
  assert.deepEqual(gate.unknownOwners, ['BottomSheet.handle', 'Toolbar.root'])
  assert.equal(gate.rollout, 'unchanged')
  for (const mutate of [
    (v) => {
      v.proofs = []
    },
    (v) => {
      v.proofs.push(v.proofs[0])
    },
    (v) => {
      v.contracts[0].audit = 'audited'
    },
    (v) => {
      v.contracts[0].audit = 'certified'
    },
    (v) => {
      v.proofs[0].sourceCommit = 'c'.repeat(40)
    },
    (v) => {
      v.proofs[0].manifestSha256 = 'c'.repeat(64)
    },
    (v) => {
      v.proofs[0].trackedChanges = true
    },
    (v) => {
      v.proofs[0].declaredAudit = 'unknown'
    },
    (v) => {
      v.proofs[0].passed = false
    },
    (v) => {
      v.proofs[0].rungs = []
    },
    (v) => {
      v.proofs[0].assessment = 'publisher-claim-only'
    },
  ]) {
    const invalid = structuredClone(args)
    mutate(invalid)
    assert.equal(assessDeclaredAudits(invalid).passed, false)
  }
})

function contractReceipt() {
  const input = contractInputs()
  input.declaration.audit = 'audited'
  const proof = assessTabsContract(input)
  proof.declarationGate = assessDeclaredAudits({
    contracts: ownerShadow.contracts,
    proofs: [proof],
    sourceCommit: commit,
    manifestSha256: input.manifestSha256,
  })
  return proof
}

test('status separates a declared audit from one unambiguous current host proof', () => {
  const options = { commit, expectedManifestSha256: 'b'.repeat(64) }
  const receipt = contractReceipt()
  assert.equal(receipt.passed, true)
  const report = stylingFactStatus({ ...options, receipts: [receipt] })
  assert.deepEqual(report.contractEvidence, {
    scope: 'selected-shadow-contracts-not-global-coverage',
    declaredOwners: ['Tabs.Tab'],
    verifiedOwners: ['Tabs.Tab'],
    unverifiedDeclaredOwners: [],
    conflictingOwners: [],
    unknownOwners: ['BottomSheet.handle', 'Toolbar.root'],
    counts: { declared: 1, verified: 1, unverified: 0, conflicting: 0, unknown: 2 },
  })
  assert.equal(report.observations[0].status, 'measured')
  assert.ok(report.observations[0].fidelityLimits.includes('device pixels'))
  assert.equal(report.globalMeasures.contractAudit, null)
  assert.deepEqual(stylingFactStatus(options).contractEvidence.unverifiedDeclaredOwners, [
    'Tabs.Tab',
  ])
  const duplicate = stylingFactStatus({ ...options, receipts: [receipt, receipt] })
  assert.deepEqual(duplicate.contractEvidence.verifiedOwners, [])
  assert.deepEqual(duplicate.contractEvidence.conflictingOwners, ['Tabs.Tab'])
  const nativeInputs = (value) =>
    value.scopedDenominators.find((row) => row.id === 'tabs-native-inputs')
  assert.equal(nativeInputs(report).verified, 32)
  assert.equal(nativeInputs(duplicate).status, 'conflicting')
  assert.equal(nativeInputs(duplicate).verified, null)
  assert.equal(nativeInputs(stylingFactStatus(options)).status, 'missing')
  assert.equal(
    nativeInputs(
      stylingFactStatus({ ...options, receipts: [{ ...receipt, sourceCommit: 'c'.repeat(40) }] }),
    ).status,
    'stale',
  )
  assert.deepEqual(
    stylingFactStatus({ ...options, trackedChanges: true, receipts: [receipt] }).contractEvidence
      .verifiedOwners,
    [],
  )
})

test('status never credits stale, dirty, failed, foreign-manifest or incomplete contract reports', () => {
  const options = { commit, expectedManifestSha256: 'b'.repeat(64) }
  for (const mutate of [
    (v) => {
      v.schema = 0
    },
    (v) => {
      v.sourceCommit = 'c'.repeat(40)
    },
    (v) => {
      v.trackedChanges = true
    },
    (v) => {
      delete v.trackedChanges
    },
    (v) => {
      v.passed = false
    },
    (v) => {
      v.manifestSha256 = 'c'.repeat(64)
    },
    (v) => {
      v.rungs = [1]
    },
    (v) => {
      v.declaredAudit = 'unknown'
    },
    (v) => {
      v.declarationGate.passed = false
    },
    (v) => {
      v.declarationGate.verifiedOwners = []
    },
    (v) => {
      v.owner = 'BottomSheet.handle'
    },
    (v) => {
      v.inputDomain.owner = 'BottomSheet.handle'
    },
    (v) => {
      v.fidelity.limits = [false]
    },
  ]) {
    const receipt = contractReceipt()
    mutate(receipt)
    assert.deepEqual(
      stylingFactStatus({ ...options, receipts: [receipt] }).contractEvidence.verifiedOwners,
      [],
    )
  }
  assert.deepEqual(
    stylingFactStatus({ commit, receipts: [contractReceipt()] }).contractEvidence.verifiedOwners,
    [],
  )
})

test('Owner input audit has finite denominators without self-promoting contracts or rollout', () => {
  const report = auditOwnerInputs(inputReceipts())
  assert.equal(report.passed, true)
  assert.deepEqual(
    report.domains.map(({ inputCases, nativeObservations, webObservations }) => [
      inputCases,
      nativeObservations,
      webObservations,
    ]),
    [
      [8, 32, 24],
      [9, 36, 27],
    ],
  )
  assert.equal(report.contractAudit, 'unknown')
  assert.deepEqual(report.domains[0].modality, {
    cases: 8,
    commonCases: 7,
    uaConditionedCases: 1,
    nativeObservations: 32,
    webObservations: 24,
    pointerReclickVisibility: ['candidate', 'tailwind', 'prepared'].map((kind) => ({
      kind,
      native: false,
      web: false,
    })),
  })
  assert.equal(report.rollout, 'unchanged')
  assert.deepEqual(report.domains[0].labels, {
    cases: 5,
    nativeObservations: 20,
    webObservations: 15,
  })
  assert.deepEqual(report.domains[0].containers, {
    cases: 4,
    nativeObservations: 16,
    webObservations: 12,
  })
})

test('UA-conditioned indication differences stay visible and never promote common equivalence', () => {
  const input = inputReceipts()
  for (const row of input.webTabs.modalityObservations) {
    if (row.input !== 'pointer-while-focused') continue
    row.visible = true
    row.rows = expectedTabModality({ focused: true, visible: true })
  }
  const report = auditOwnerInputs(input)
  assert.equal(report.passed, true)
  assert.equal(report.domains[0].modality.commonCases, 7)
  assert.deepEqual(
    report.domains[0].modality.pointerReclickVisibility,
    ['candidate', 'tailwind', 'prepared'].map((kind) => ({ kind, native: false, web: true })),
  )
  assert.ok(report.remaining.includes('UA/native focus-visible heuristic alignment'))
})

test('Owner input audit rejects stale, dirty, failed or missing evidence on either platform', () => {
  for (const name of ['nativeTabs', 'webTabs', 'nativeHandle', 'webHandle']) {
    for (const change of [
      null,
      { sourceCommit: 'c'.repeat(40) },
      { trackedChanges: true },
      { passed: false },
      { trackedChanges: undefined },
    ]) {
      const input = inputReceipts()
      input[name] = change === null ? null : { ...input[name], ...change }
      assert.equal(auditOwnerInputs(input).passed, false, `${name}: ${JSON.stringify(change)}`)
    }
  }
  assert.equal(auditOwnerInputs({ ...inputReceipts(), trackedChanges: true }).passed, false)
})

test('Owner input audit requires every route, real delivery values, lifetime and negative controls', () => {
  for (const mutate of [
    (input) => input.nativeTabs.inputObservations.pop(),
    (input) => input.nativeTabs.labelObservations.pop(),
    (input) => input.nativeTabs.containerObservations.pop(),
    (input) => {
      input.nativeTabs.containerObservations[0].textHosts = 0
    },
    (input) => {
      input.webTabs.containerObservations[0].rows[0].label = 'beforeafter'
    },
    (input) => {
      input.webTabs.labelObservations[0].rows[1].label = ''
    },
    (input) => {
      input.nativeTabs.labelObservations[0].rows[1].color = '#334455'
    },
    (input) => input.nativeTabs.modalityObservations.pop(),
    (input) => {
      input.webTabs.modalityObservations[0].visible = true
    },
    (input) => {
      input.webTabs.modalityObservations[1].rows[1].bottom = 0
    },
    (input) => {
      input.nativeTabs.modalityObservations[1].rows[1].decoration = 'none'
    },
    (input) => {
      input.webTabs.modalityObservations[7] = input.webTabs.modalityObservations[6]
    },
    (input) => {
      input.webTabs.inputObservations[1] = input.webTabs.inputObservations[0]
    },
    (input) => {
      input.nativeTabs.inputObservations[0].rows[0].selected = false
    },
    (input) => {
      input.nativeHandle.observations[3].selected.host = 'Pressable'
    },
    (input) => {
      input.webHandle.observations[5].sameHost = true
    },
    (input) => {
      input.webHandle.observations[5].selected.padding = 0
    },
    (input) => {
      input.webTabs.prepared.identity.owner = 'BottomSheet.handle'
    },
    (input) => {
      input.webTabs.prepared.delivery = 'manual-wiring'
    },
    (input) => {
      input.webHandle.controls[0].absentStylesheetDetected = false
    },
    (input) => {
      input.webTabs.controls[0].blockedDisabledFocusAndClick = false
    },
    (input) => {
      input.nativeTabs.requests.instance = 1
    },
    (input) => {
      input.nativeTabs.stylesheetCreates = 2
    },
  ]) {
    const input = inputReceipts()
    mutate(input)
    assert.equal(auditOwnerInputs(input).passed, false)
  }
})
const states = [
  [false, 'rest'],
  [true, 'rest'],
  [true, 'hover'],
  [true, 'focus'],
  [true, 'pressed'],
]
function browser() {
  return {
    schema: 1,
    passed: true,
    sourceCommit: commit,
    scope: 'web-computed-style-real-pointer-focus',
    observations: ['candidate', 'tailwind'].flatMap((kind) =>
      states.map(([interactive, state]) => ({
        kind,
        interactive,
        state,
        selected: {
          paddingTop: '16px',
          width: '32px',
          opacity: '1',
          backgroundColor: 'rgb(34, 51, 68)',
        },
      })),
    ),
  }
}
test('inventory stays separate from scoped evidence and missing global measures are not zero', () => {
  const report = stylingFactStatus({ commit, receipts: [browser()] })
  assert.deepEqual(report.inventory, {
    components: 27,
    slots: 100,
    pendingOwners: 56,
    componentManaged: 33,
    componentManagedPending: 33,
    shadowContributions: 3,
    shadowAuditUnknown: 2,
    shadowAuditDeclared: 1,
  })
  assert.equal(report.observations[0].status, 'measured')
  assert.equal(report.observations[0].matchedPairs, 5)
  for (const key of ['coverage', 'fidelity', 'diagnosed', 'contractAudit'])
    assert.equal(report.globalMeasures[key], null)
  assert.equal(report.rollout, 'not-established-by-this-report')
})
test('stale, failed, incomplete, duplicate and mismatched receipts never become a pass', () => {
  for (const [receipt, status] of [
    [null, 'missing'],
    [{ ...browser(), sourceCommit: 'b'.repeat(40) }, 'stale'],
    [{ ...browser(), passed: false }, 'failed'],
    [{ ...browser(), trackedChanges: true }, 'uncommitted'],
    [{ ...browser(), sourceCommit: undefined }, 'invalid'],
    [{ ...browser(), observations: [] }, 'invalid'],
    [{ ...browser(), observations: Array(10).fill(browser().observations[0]) }, 'invalid'],
  ])
    assert.equal(stylingFactStatus({ commit, receipts: [receipt] }).observations[0].status, status)
  const mismatch = browser()
  mismatch.observations[0].selected.opacity = '0'
  assert.equal(
    stylingFactStatus({ commit, receipts: [mismatch] }).observations[0].status,
    'invalid',
  )
})
test('bundle deltas are derived from measured rows, not trusted headline or inventory numbers', () => {
  const receipt = {
    schema: 1,
    passed: true,
    sourceCommit: commit,
    scope: 'explicit-component-bundle-react-native-peers-external',
    delta: { bytes: -99999 },
    measurements: [
      { mode: 'opaque', bytes: 1000, gzipBytes: 400, sha256: 'a'.repeat(64) },
      { mode: 'prepared', bytes: 1100, gzipBytes: 410, sha256: 'b'.repeat(64) },
    ],
  }
  assert.deepEqual(stylingFactStatus({ commit, receipts: [receipt] }).observations[0].delta, {
    bytes: 100,
    gzipBytes: 10,
  })
  const report = stylingFactStatus({ commit, receipts: [receipt] })
  const summary = renderStylingFactSummary(report)
  assert.match(
    summary,
    /native-component-bundle \| native-build \| bundle build \| 2 \| 2 \| measured/,
  )
  assert.match(
    summary,
    /tabs-native-inputs \| native-host-model \| input\/route row \| — \| 32 \| missing/,
  )
  assert.match(summary, /100 bytes, 10 gzip bytes/)
  assert.match(
    summary,
    /Global coverage, fidelity, diagnostic completeness and contract audit are not established/,
  )
  receipt.measurements[1].bytes = -1
  assert.equal(stylingFactStatus({ commit, receipts: [receipt] }).observations[0].status, 'invalid')
})

test('prepared browser rows require their own provenance and complete pairs without promoting global coverage', () => {
  const receipt = browser()
  receipt.controls = ['candidate', 'tailwind', 'prepared'].flatMap((kind) =>
    [false, true].map((interactive) => ({ kind, interactive, absentStylesheetDetected: true })),
  )
  receipt.prepared = {
    identity: {
      owner: 'BottomSheet.handle',
      platform: 'web',
      classProp: 'handleClassName',
      manifestSha256: 'b'.repeat(64),
    },
    fingerprint: 'test-context',
    preparations: 1,
  }
  receipt.observations.push(
    ...receipt.observations
      .filter((row) => row.kind === 'candidate')
      .map((row) => ({ ...row, kind: 'prepared' })),
  )
  const result = stylingFactStatus({ commit, receipts: [receipt] })
  assert.equal(result.observations[0].status, 'measured')
  assert.equal(result.observations[0].matchedPairs, 10)
  assert.equal(result.observations[0].denominator, 10)
  assert.equal(result.globalMeasures.contractAudit, null)
  assert.equal(result.globalMeasures.coverage, null)
  receipt.prepared.delivery = 'composed-ordinary-lowering'
  receipt.prepared.ordinaryParses = 1
  assert.equal(
    stylingFactStatus({ commit, receipts: [receipt] }).observations[0].status,
    'measured',
  )
  for (const changed of [
    { ...receipt.prepared, ordinaryParses: 2 },
    { ...receipt.prepared, delivery: 'explicit-preview-only' },
    { ...receipt.prepared, delivery: undefined },
    { ...receipt.prepared, ordinaryParses: undefined },
  ])
    assert.equal(
      stylingFactStatus({ commit, receipts: [{ ...receipt, prepared: changed }] }).observations[0]
        .status,
      'invalid',
    )
  for (const change of [
    (value) => {
      value.prepared.identity.platform = 'ios'
    },
    (value) => {
      value.prepared.identity.manifestSha256 = ''
    },
    (value) => {
      value.observations.pop()
    },
    (value) => {
      value.controls.pop()
    },
    (value) => {
      value.controls[0] = null
    },
    (value) => {
      value.observations[0] = null
    },
    (value) => {
      value.prepared = null
    },
    (value) => {
      value.observations.find((row) => row.kind === 'prepared').selected = { paddingTop: '0px' }
    },
  ]) {
    const bad = structuredClone(receipt)
    change(bad)
    assert.equal(stylingFactStatus({ commit, receipts: [bad] }).observations[0].status, 'invalid')
  }
})
