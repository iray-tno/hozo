// RFC010 rung 3 is host/ABI delivery, not universal CSS fidelity or device pixels.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOwnerContractShadow } from '../../packages/compiler/src/owner-contract.ts'
import { parseOwnerPackageShadow } from '../../packages/compiler/src/owner-package.ts'
import { evidenceSource } from './evidence-source.mjs'
import { auditOwnerInputs } from './owner-input-audit.mjs'
import { checkPublicProps } from './public-props.mjs'
import { expectedTabRows, tabLabelClasses, tabPhases } from './tabs-probe.mjs'

const routes = ['opaque', 'prepared', 'caller', 'instance']
const kinds = ['candidate', 'tailwind', 'prepared']
const facts = ['disabled', 'aria-selected', 'aria-disabled']

export function tabsDeclaration(text) {
  const data = parseOwnerPackageShadow(text)
  const selected = data.owners?.contracts.filter((row) => row.owner === 'Tabs.Tab')
  assert.equal(selected?.length, 1, 'Package must declare the selected Tabs contract')
  for (const name of ['Tabs', 'HozoTabs'])
    assert.ok(
      data.exports.some((row) => row.name === name && row.owners.includes('Tabs.Tab')),
      'Both public aliases must reference the contract',
    )
  return selected[0]
}

/** This gate consumes independently assessed CI output, never package-supplied
 * evidence. Every declared audited shadow owner needs its own current proof. */
export function assessDeclaredAudits({ contracts, proofs, sourceCommit, manifestSha256 }) {
  try {
    assert.match(sourceCommit, /^[a-f0-9]{40}$/)
    assert.match(manifestSha256, /^[a-f0-9]{64}$/)
    const indexed = new Map(proofs.map((proof) => [proof.owner, proof]))
    assert.equal(indexed.size, proofs.length, 'Duplicate independent owner proofs')
    const required = contracts.filter((row) => row.audit === 'audited')
    assert.equal(new Set(contracts.map((row) => row.owner)).size, contracts.length)
    assert.ok(contracts.every((row) => row.audit === 'unknown' || row.audit === 'audited'))
    for (const contract of required) {
      const proof = indexed.get(contract.owner)
      assert.ok(proof, `No independent host proof for ${contract.owner}`)
      assert.equal(proof.passed, true)
      assert.equal(proof.assessment, 'host-delivery-verified')
      assert.deepEqual(proof.rungs, [1, 2, 3])
      assert.equal(proof.sourceCommit, sourceCommit)
      assert.equal(proof.trackedChanges, false)
      assert.equal(proof.manifestSha256, manifestSha256)
      assert.equal(proof.declaredAudit, 'audited')
    }
    return {
      passed: true,
      scope: 'declared-audited-shadow-contracts',
      verifiedOwners: required.map((row) => row.owner),
      unknownOwners: contracts.filter((row) => row.audit === 'unknown').map((row) => row.owner),
      rollout: 'unchanged',
    }
  } catch (error) {
    return {
      passed: false,
      scope: 'declared-audited-shadow-contracts',
      reason: error.message,
      rollout: 'unchanged',
    }
  }
}

function matrix(actual, names, phases, check) {
  assert.equal(actual?.length, names.length * phases.length, 'Incomplete contract matrix')
  const remaining = new Set(names.flatMap((name) => phases.map((phase) => `${name}:${phase}`)))
  for (const row of actual) {
    assert.ok(
      remaining.delete(`${row.route ?? row.kind}:${row.phase}`),
      'Unknown/duplicate contract row',
    )
    check(row)
  }
  assert.equal(remaining.size, 0)
}

function labels(phase) {
  return expectedTabRows(phase).map((row, at) => ({
    color: row.selected ? '#445566' : '#334455',
    size: 18,
    weight: row.disabled ? '700' : '400',
    spacing: at === 1 && phase !== 'initial' ? 1 : 0,
  }))
}

function authorRows(phase) {
  const overridden = phase.startsWith('with-author')
  return expectedTabRows('selected-disabled').map((row) => ({
    rowGap: overridden ? 5 : 3,
    columnGap: overridden ? 7 : 2,
    background: overridden ? '#abcdef' : row.background,
    opacity: overridden ? 0.8 : row.opacity,
  }))
}

export function assessTabsContract({
  sourceCommit,
  trackedChanges = false,
  declaration,
  manifestSha256,
  publicPropsVerified = false,
  nativeTabs,
  webTabs,
}) {
  const base = {
    owner: 'Tabs.Tab',
    scope: 'box-and-owned-label-host-delivery',
    sourceCommit,
    trackedChanges,
  }
  try {
    assert.equal(publicPropsVerified, true, 'Actual exported Web/Native props must pass tsc')
    const { audit: _claim, ...contract } = declaration
    // This describes the actual component, independently of the manifest.
    assert.deepEqual(
      contract,
      {
        owner: 'Tabs.Tab',
        classProp: 'tabClassName',
        bindings: ['present'],
        abi: { nativePreparedProp: 'hozoTabStyle', webClassProp: 'tabClassName' },
        authoredStyles: [{ prop: 'tabStyle', order: 0 }],
        shapes: [
          {
            id: 'tab',
            when: { eq: ['present', true] },
            nativeHost: 'Pressable',
            webHost: 'button',
            events: ['pressed', 'hovered', 'focused', 'focusVisible'],
            inputs: { facts, splitText: true },
          },
        ],
      },
      'Contract differs from the independently checked host/ABI domain',
    )
    const domain = auditOwnerInputs({
      sourceCommit,
      trackedChanges,
      nativeTabs,
      webTabs,
    }).domains.find((row) => row.owner === base.owner)
    assert.equal(domain.status, 'measured', domain.reason)
    assert.match(manifestSha256, /^[a-f0-9]{64}$/)
    for (const [identity, platform] of [
      [nativeTabs.instance?.identity, 'ios'],
      [webTabs.prepared?.identity, 'web'],
    ]) {
      assert.equal(identity?.owner, base.owner)
      assert.equal(identity.classProp, 'tabClassName')
      assert.equal(identity.platform, platform)
      assert.equal(identity.manifestSha256, manifestSha256, 'Evidence refers to another manifest')
    }
    assert.equal(nativeTabs.classes, tabLabelClasses)
    assert.deepEqual(nativeTabs.declarations, facts)
    assert.equal(nativeTabs.splitText, true)
    assert.equal(nativeTabs.instance.stylesheetSites, 1)
    assert.equal(nativeTabs.instance.contextPreparations, 1)
    assert.equal(nativeTabs.instance.contextFingerprint, nativeTabs.fingerprint)
    assert.equal(nativeTabs.aliasesSameOwner, true)
    assert.equal(webTabs.aliasesSameOwner, true)
    matrix(nativeTabs.observations, routes, tabPhases, (row) => {
      assert.deepEqual(row.rows, expectedTabRows(row.phase))
      assert.deepEqual(row.labels, labels(row.phase))
    })
    matrix(webTabs.observations, kinds, tabPhases, (row) => {
      assert.deepEqual(
        row.selected,
        expectedTabRows(row.phase).map((value, at) => ({
          ...value,
          color: value.selected ? 'rgb(68, 85, 102)' : 'rgb(51, 68, 85)',
          fontSize: 18,
          fontWeight: value.disabled ? '700' : '400',
          letterSpacing: at === 1 && row.phase !== 'initial' ? 1 : 0,
          rowGap: 3,
          columnGap: 2,
        })),
      )
    })
    matrix(
      nativeTabs.authorObservations,
      routes,
      ['before-author', 'with-author', 'author-removed'],
      (row) => {
        assert.deepEqual(row.rows, authorRows(row.phase))
        assert.deepEqual(row.labels, labels('selected-disabled'))
        assert.equal(row.hostEvaluationGetterReads, row.phase === 'with-author' ? 3 : 0)
      },
    )
    matrix(
      webTabs.authorObservations,
      kinds,
      ['before-author', 'with-author', 'with-author-selected-enabled', 'after-removal'],
      (row) => assert.deepEqual(row.rows, authorRows(row.phase)),
    )
    return {
      ...base,
      passed: true,
      assessment: 'host-delivery-verified',
      rungs: [1, 2, 3],
      manifestSha256,
      declaredAudit: declaration.audit,
      inputDomain: domain,
      fidelity: {
        exact: false,
        limits: [
          'opaque descendant inheritance',
          'UA/native focus-visible heuristics',
          'OS event delivery/cancellation',
          'device pixels',
        ],
      },
      rollout: 'unchanged',
    }
  } catch (error) {
    return {
      ...base,
      passed: false,
      assessment: 'not-established',
      reason: error.message,
      rollout: 'unchanged',
    }
  }
}

const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = (name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'))
  const source = evidenceSource()
  let report
  try {
    const manifestText = readFileSync(
      path.join(root, 'packages/patterns/hozo.manifest.json'),
      'utf8',
    )
    const declaration = tabsDeclaration(manifestText)
    const published = parseOwnerPackageShadow(manifestText).owners
    const shadow = parseOwnerContractShadow(
      readFileSync(path.join(root, 'scripts/style-slots/owner-shadow.json'), 'utf8'),
    )
    const publishedOwners = new Set(published.contracts.map((row) => row.owner))
    assert.deepEqual(
      published,
      {
        schema: shadow.schema,
        contracts: shadow.contracts.filter((row) => publishedOwners.has(row.owner)),
      },
      'Published declarations differ from their inventoried shadow contracts',
    )
    checkPublicProps()
    report = assessTabsContract({
      ...source,
      declaration,
      manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
      publicPropsVerified: true,
      nativeTabs: read('artifacts/style-fact-model/tabs-compiled-native.json'),
      webTabs: read('artifacts/style-fact-model/tabs-browser.json'),
    })
    report.declarationGate = assessDeclaredAudits({
      contracts: shadow.contracts,
      proofs: [report],
      sourceCommit: source.sourceCommit,
      manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
    })
    if (!report.declarationGate.passed) {
      report.passed = false
      report.reason ??= report.declarationGate.reason
    }
  } catch (error) {
    report = {
      ...source,
      owner: 'Tabs.Tab',
      passed: false,
      assessment: 'not-established',
      reason: error.message,
    }
  }
  const output = path.join(root, 'artifacts/style-fact-model/tabs-contract-audit.json')
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exitCode = 1
}
