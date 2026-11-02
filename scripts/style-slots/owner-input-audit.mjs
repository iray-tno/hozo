// A finite delivery audit, not a promotion of a manifest's own audit claim.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { evidenceSource } from './evidence-source.mjs'
import {
  expectedIdleTabInputs,
  expectedTabModality,
  handleInputCases,
  tabInputCases,
  tabModalityCases,
} from './owner-input-cases.mjs'

const nativeTabRoutes = ['opaque', 'prepared', 'caller', 'instance']
const webKinds = ['candidate', 'tailwind', 'prepared']
const platforms = ['android', 'ios']

function requireFact(condition, message) {
  if (!condition) throw new Error(message)
}

function receipt(value, sourceCommit, scope) {
  requireFact(value?.schema === 1 && value.scope === scope, 'Missing/invalid receipt scope')
  requireFact(value.sourceCommit === sourceCommit, 'Receipt belongs to a different checkout')
  requireFact(value.trackedChanges === false, 'Receipt is dirty or lacks clean-source identity')
  requireFact(value.passed === true, 'Receipt did not pass')
  return value
}

function webProvenance(value, owner) {
  const prepared = value.prepared
  requireFact(
    prepared?.identity?.owner === owner &&
      prepared.identity.platform === 'web' &&
      /^[a-f0-9]{64}$/.test(prepared.identity.manifestSha256 ?? '') &&
      typeof prepared.fingerprint === 'string' &&
      prepared.fingerprint.length > 0 &&
      prepared.delivery === 'composed-ordinary-lowering' &&
      prepared.preparations === 1 &&
      prepared.ordinaryParses === 1,
    'Missing prepared package/composition provenance',
  )
}

function checkRows(actual, expected) {
  requireFact(Array.isArray(actual) && actual.length === expected.length, 'Incomplete input matrix')
  const remaining = new Map(expected.map((row) => [row.key, row]))
  for (const row of actual) {
    const key = row.platform
      ? `${row.platform}:${row.route}:${row.input}`
      : `${row.route ?? row.kind}:${row.input}`
    const wanted = remaining.get(key)
    requireFact(wanted, `Unexpected/duplicate observation: ${key}`)
    requireFact(
      isDeepStrictEqual(row.rows ?? row.selected, wanted.value),
      `Owner delivery differs: ${key}`,
    )
    if (Object.hasOwn(wanted, 'sameHost'))
      requireFact(row.sameHost === wanted.sameHost, `Owner lifetime differs: ${key}`)
    remaining.delete(key)
  }
  requireFact(remaining.size === 0, 'Missing input observation')
}

function tabs(native, web) {
  checkRows(
    native.modalityObservations,
    nativeTabRoutes.flatMap((route) =>
      tabModalityCases.map((input) => ({
        key: `${route}:${input.id}`,
        value: expectedTabModality(input),
      })),
    ),
  )
  const browserModality = webKinds.flatMap((kind) =>
    tabModalityCases.map((input) => {
      const observed = web.modalityObservations?.find(
        (row) => row.kind === kind && row.input === input.id,
      )
      requireFact(
        typeof observed?.visible === 'boolean',
        'Missing actual browser focus-visible fact',
      )
      const uaConditioned = input.id === 'pointer-while-focused'
      if (!uaConditioned)
        requireFact(observed.visible === input.visible, 'Common browser modality differs')
      return {
        key: `${kind}:${input.id}`,
        value: expectedTabModality({
          ...input,
          visible: uaConditioned ? observed.visible : input.visible,
        }),
      }
    }),
  )
  checkRows(web.modalityObservations, browserModality)
  checkRows(
    native.inputObservations,
    nativeTabRoutes.flatMap((route) =>
      tabInputCases.map((input) => ({
        key: `${route}:${input.id}`,
        value: expectedIdleTabInputs(input),
      })),
    ),
  )
  checkRows(
    web.inputObservations,
    webKinds.flatMap((kind) =>
      tabInputCases.map((input) => ({
        key: `${kind}:${input.id}`,
        value: expectedIdleTabInputs(input),
      })),
    ),
  )
  requireFact(native.stylesheetCreates === 1, 'Carrier recreated its stylesheet')
  requireFact(
    native.requests?.opaque > 0 &&
      nativeTabRoutes.slice(1).every((route) => native.requests[route] === 0),
    'Missing opaque/prepared resolver control',
  )
  requireFact(
    web.controls?.length === 3 &&
      webKinds.every((kind) =>
        web.controls.some(
          (row) =>
            row.kind === kind &&
            row.blockedDisabledFocusAndClick &&
            row.absentDisabledHooksDetected,
        ),
      ),
    'Missing browser disabled controls',
  )
}

function handleValue(input, web) {
  return {
    host: web ? (input.interactive ? 'BUTTON' : 'DIV') : input.interactive ? 'Pressable' : 'View',
    padding: 8,
    opacity: 1,
    rowGap: 16,
    columnGap: 16,
    background: '#ffffff',
  }
}

function handles(native, web) {
  checkRows(
    native.observations,
    platforms.flatMap((platform) =>
      ['opaque', 'caller'].flatMap((route) =>
        handleInputCases.map((input) => ({
          key: `${platform}:${route}:${input.id}`,
          value: handleValue(input, false),
        })),
      ),
    ),
  )
  checkRows(
    web.observations,
    webKinds.flatMap((kind) =>
      handleInputCases.map((input, at) => ({
        key: `${kind}:${input.id}`,
        value: handleValue(input, true),
        sameHost: input.interactive === (at ? handleInputCases[at - 1].interactive : false),
      })),
    ),
  )
  requireFact(
    web.controls?.length === 3 &&
      webKinds.every((kind) =>
        web.controls.some((row) => row.kind === kind && row.absentStylesheetDetected === true),
      ),
    'Missing browser stylesheet controls',
  )
}

export function auditOwnerInputs({
  sourceCommit,
  trackedChanges = false,
  nativeTabs,
  webTabs,
  nativeHandle,
  webHandle,
}) {
  const specs = [
    {
      owner: 'Tabs.Tab',
      native: nativeTabs,
      web: webTabs,
      nativeScope: 'native-tabs-compiled-owner-component-host-model',
      webScope: 'web-tabs-real-pointer-focus',
      cases: tabInputCases.length,
      nativeObservations: 32,
      webObservations: 24,
      check: tabs,
    },
    {
      owner: 'BottomSheet.handle',
      native: nativeHandle,
      web: webHandle,
      nativeScope: 'native-handle-normalized-live-input-host-model',
      webScope: 'web-handle-normalized-live-inputs',
      cases: handleInputCases.length,
      nativeObservations: 36,
      webObservations: 27,
      check: handles,
    },
  ]
  const domains = specs.map((spec) => {
    const base = { owner: spec.owner, inputCases: spec.cases }
    try {
      requireFact(
        /^[a-f0-9]{40}$/.test(sourceCommit ?? '') && trackedChanges === false,
        'Audit checkout is dirty/invalid',
      )
      const native = receipt(spec.native, sourceCommit, spec.nativeScope)
      const web = receipt(spec.web, sourceCommit, spec.webScope)
      webProvenance(web, spec.owner)
      spec.check(native, web)
      return {
        ...base,
        status: 'measured',
        nativeObservations: spec.nativeObservations,
        webObservations: spec.webObservations,
        ...(spec.owner === 'Tabs.Tab'
          ? {
              modality: {
                cases: tabModalityCases.length,
                commonCases: tabModalityCases.length - 1,
                uaConditionedCases: 1,
                nativeObservations: nativeTabRoutes.length * tabModalityCases.length,
                webObservations: webKinds.length * tabModalityCases.length,
                pointerReclickVisibility: webKinds.map((kind) => ({
                  kind,
                  native: false,
                  web: web.modalityObservations.find(
                    (row) => row.kind === kind && row.input === 'pointer-while-focused',
                  ).visible,
                })),
              },
            }
          : {}),
      }
    } catch (error) {
      return { ...base, status: 'not-established', reason: error.message }
    }
  })
  return {
    schema: 1,
    scope: 'bounded-owner-live-input-audit',
    sourceCommit,
    trackedChanges,
    passed: domains.every((row) => row.status === 'measured'),
    domains,
    denominatorKind:
      'Authored finite live-input and modality cases, not all Owner inputs or styling support',
    nativeEvidence: 'Actual component logic with RN host and Modal lifetime models; not devices',
    contractAudit: 'unknown',
    rollout: 'unchanged',
    remaining: [
      'mid-press disable/event cancellation',
      'native OS modality event delivery',
      'UA/native focus-visible heuristic alignment',
      'opaque label descendants',
      'device acceptance/pixels',
      'other Owners and arbitrary inputs',
    ],
  }
}

const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = (name) => {
    try {
      return JSON.parse(readFileSync(path.join(root, 'artifacts/style-fact-model', name), 'utf8'))
    } catch {
      return null
    }
  }
  const report = auditOwnerInputs({
    ...evidenceSource(),
    nativeTabs: read('tabs-compiled-native.json'),
    webTabs: read('tabs-browser.json'),
    nativeHandle: read('handle-inputs-native.json'),
    webHandle: read('handle-inputs-browser.json'),
  })
  const args = process.argv.slice(2)
  requireFact(
    args.length === 0 || (args.length === 2 && args[0] === '--output'),
    'Usage: owner-input-audit.mjs [--output file]',
  )
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (args[1]) {
    const output = path.resolve(root, args[1])
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, text)
  } else console.log(text.trimEnd())
  if (!report.passed) process.exitCode = 1
}
