import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const beforeCommit = 'cc1914bf49aaddd642d850bed77cb503e3e9966d'
const afterCommit = '6333a72ba5720fc3b25f4eeab0bbd66b5bf131b4'
const operations = ['mount', 'parentUpdate', 'oneRowPress']

export function report(records, currentCommit, baselineCommit) {
  assert.equal(records.before.sourceCommit, beforeCommit)
  assert.equal(records.after.sourceCommit, afterCommit)
  assert.equal(records.current.sourceCommit, currentCommit)
  if (baselineCommit) assert.equal(records.baseline?.sourceCommit, baselineCommit)
  else
    assert.equal(records.baseline, undefined, 'baseline needs an explicit expected source commit')
  assert.notEqual(
    records.before.binarySha256,
    records.after.binarySha256,
    'before/after #888 reused the same addon',
  )
  for (const [name, value] of Object.entries(records)) {
    assert.equal(value.schemaVersion, 1, name)
    assert.equal(value.driverCommit, records.current.driverCommit, 'different benchmark drivers')
    assert.deepEqual(
      value.environment,
      records.current.environment,
      'dependencies or runner changed',
    )
    assert.deepEqual(
      value.methodology,
      records.current.methodology,
      'different measurement settings',
    )
    assert.equal(value.fixture.source, records.current.fixture.source, 'different authored fixture')
    assert.match(value.binarySha256, /^[a-f0-9]{64}$/)
    const expectedKeys = records.current.methodology.rows
      .flatMap((rows) => ['plain', 'state-classes'].map((scenario) => `${scenario}:${rows}`))
      .sort()
    assert.deepEqual(
      value.results.map(({ scenario, rows }) => `${scenario}:${rows}`).sort(),
      expectedKeys,
      'missing or duplicate scenario',
    )
    for (const result of value.results) {
      assert.equal(result.semantic.restingOpacity, null)
      assert.equal(result.semantic.siblingOpacity, null, 'press leaked to idle siblings')
      assert.equal(
        result.semantic.stateSupported,
        name !== 'before' && result.scenario === 'state-classes',
      )
      assert.equal(
        result.semantic.pressedOpacity,
        name !== 'before' && result.scenario === 'state-classes' ? 0.5 : null,
      )
      for (const operation of operations) {
        const samples = result[operation].samplesMs
        assert.equal(samples.length, value.methodology.samples, 'sample count changed')
        assert.ok(samples.every((sample) => Number.isFinite(sample) && sample >= 0))
        assert.equal(
          result[operation].medianMs,
          [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.5) - 1],
          'median differs from raw evidence',
        )
      }
    }
  }
  assert.ok(
    records.before.warnings.runtime.some((message) => message.includes('active:opacity-50')),
    'the unsupported historical state class must be reported',
  )
  const lines = [
    '# Runtime Native class list — historical rendering measurement',
    '',
    `Before #888: \`${beforeCommit}\`; after #888: \`${afterCommit}\`; current: \`${currentCommit}\`.`,
    `Driver: \`${records.current.driverCommit}\`. Node ${records.current.environment.node}, React ${records.current.environment.react}.`,
    ...(baselineCommit
      ? [`Optimization baseline: \`${baselineCommit}\`, built and measured on the same runner.`]
      : []),
    '',
    `${records.current.methodology.samples} retained samples after ${records.current.methodology.warmups} untimed warmups per case. Values below are median milliseconds, not thresholds. Raw samples, p90, warnings and emitted code are in each JSON artifact.`,
    ...(records.current.methodology.cpuProfiling
      ? [
          'CPU sampling enabled: these timings include profiler overhead and must not be compared with unprofiled runs.',
        ]
      : []),
    '',
    baselineCommit
      ? '| Classes | Rows | Operation | Before | After #888 | Baseline | Current | Current / baseline |'
      : '| Classes | Rows | Operation | Before | After #888 | Current | Current / before |',
    baselineCommit
      ? '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |'
      : '| --- | ---: | --- | ---: | ---: | ---: | ---: |',
  ]
  for (const result of records.current.results) {
    const match = (name) =>
      records[name].results.find(
        (entry) => entry.scenario === result.scenario && entry.rows === result.rows,
      )
    for (const operation of operations) {
      const before = match('before')[operation].medianMs
      const old = baselineCommit ? match('baseline')[operation].medianMs : before
      lines.push(
        `| ${result.scenario} | ${result.rows} | ${operation} | ${before.toFixed(3)} | ${match('after')[operation].medianMs.toFixed(3)} | ${baselineCommit ? `${old.toFixed(3)} | ` : ''}${result[operation].medianMs.toFixed(3)} | ${old > 0 ? `${(result[operation].medianMs / old).toFixed(2)}×` : 'n/a'} |`,
      )
    }
  }
  lines.push(
    '',
    'Interpretation boundaries:',
    '',
    '- Actual compiled Row components render through the revision-specific selected Pressable/HozoPressable and class resolver; every requested row mounts and updates, while one press re-renders only that row.',
    '- **Before #888 refuses state classes. Its state-classes timings are not equal-feature speed comparisons.** Later revisions supply the pressed opacity, verified on the rendered host.',
    '- Shared driver dependencies, serial fresh processes and separately rebuilt addons keep source revisions distinct. Candidate maps are warm; compilation/bundling, unmount and assertions are outside timers.',
    '- Development react-test-renderer + simulated RN hosts: no Hermes, production React, layout, native bridge, GPU, pixels, frame budget or physical-device conclusion.',
    '- A single runner and a small sample do not prove general speed or absence of regressions. No noisy wall-clock pass/fail threshold.',
    '',
  )
  return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , directory, currentCommit, baselineArgument] = process.argv
  const baselineCommit = baselineArgument || undefined
  assert.ok(
    directory && /^[a-f0-9]{40}$/.test(currentCommit ?? ''),
    'usage: node scripts/runtime-class-list-report.mjs ARTIFACT_DIR CURRENT_SHA [BASELINE_SHA]',
  )
  assert.ok(
    baselineCommit === undefined || /^[a-f0-9]{40}$/.test(baselineCommit),
    'invalid baseline SHA',
  )
  const records = Object.fromEntries(
    ['before', 'after', ...(baselineCommit ? ['baseline'] : []), 'current'].map((name) => [
      name,
      JSON.parse(readFileSync(path.join(directory, `${name}.json`), 'utf8')),
    ]),
  )
  const markdown = report(records, currentCommit, baselineCommit)
  writeFileSync(path.join(directory, 'summary.md'), markdown)
  process.stdout.write(markdown)
}
