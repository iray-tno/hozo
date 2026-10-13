import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAuditReport, runAuditCatalogue, summarizeAudit } from './a11y-catalogue.mjs'

const policy = { batchSize: 2, batchTimeoutMs: 100, catalogueTimeoutMs: 500 }
function harness(ids = ['a', 'b', 'c'], overrides = {}) {
  let time = 0
  let trigger
  let open = 0
  let peak = 0
  const visited = []
  const report = createAuditReport(ids, policy)
  return {
    report,
    visited,
    get peak() {
      return peak
    },
    tick(ms) {
      time += ms
    },
    timeout() {
      trigger()
    },
    options: {
      now: () => time,
      schedule: (callback) => {
        trigger = callback
        return callback
      },
      unschedule: () => {},
      ...overrides,
    },
    async openBatch(scheme) {
      open++
      peak = Math.max(peak, open)
      return {
        close: async () => {
          open--
        },
        audit: async (id, onStage) => {
          visited.push([id, scheme])
          onStage('axe')
          time += 10
          return { dark: scheme === 'dark', found: [] }
        },
      }
    },
  }
}

test('serial batches audit every indexed story exactly once in each scheme, then close', async () => {
  const h = harness()
  await runAuditCatalogue(h.report, h.openBatch, h.options)
  const verdict = summarizeAudit(h.report)
  assert.equal(verdict.passed, true)
  assert.equal(verdict.expected, 6)
  assert.equal(verdict.audited, 6)
  assert.deepEqual(h.visited, [
    ['a', 'light'],
    ['b', 'light'],
    ['c', 'light'],
    ['a', 'dark'],
    ['b', 'dark'],
    ['c', 'dark'],
  ])
  assert.equal(h.peak, 1)
  assert.deepEqual(
    h.report.batches.map((batch) => batch.audited),
    [2, 1, 2, 1],
  )
})

test('real violations and navigation/preparation failures remain distinct, both fail', async () => {
  const h = harness(['bad-contrast', 'missing'])
  await runAuditCatalogue(
    h.report,
    async (scheme) => ({
      close: async () => {},
      async audit(id, onStage) {
        if (id === 'missing') {
          onStage(scheme === 'light' ? 'navigation' : 'preparation')
          throw new Error('story did not render')
        }
        onStage('axe')
        return {
          dark: scheme === 'dark',
          found: [{ rule: 'color-contrast', help: 'low contrast' }],
        }
      },
    }),
    h.options,
  )
  const verdict = summarizeAudit(h.report)
  assert.equal(verdict.passed, false)
  assert.equal(verdict.violations, 2)
  assert.equal(verdict.errors.length, 2)
  assert.deepEqual(
    verdict.errors.map((entry) => entry.stage),
    ['navigation', 'preparation'],
  )
  assert.equal(verdict.notRun.length, 0)
  assert.ok(verdict.fresh.every((violation) => violation.rule === 'color-contrast'))
  assert.deepEqual(summarizeAudit(h.report, { 'color-contrast': 123 }).stale, [])
  assert.equal(summarizeAudit(h.report, { 'color-contrast': 123 }).passed, false)
})

test('timeout cancels only active work and leaves unvisited cases unassessed, never violations', async () => {
  const h = harness()
  let late
  let closes = 0
  await runAuditCatalogue(
    h.report,
    async () => ({
      close: async () => {
        closes++
      },
      async audit(id, onStage) {
        h.visited.push(id)
        onStage('axe')
        h.tick(100)
        queueMicrotask(() => h.timeout())
        return new Promise((resolve) => {
          late = resolve
        })
      },
    }),
    h.options,
  )
  const verdict = summarizeAudit(h.report, { 'old-rule': 123 })
  assert.equal(verdict.passed, false)
  assert.equal(verdict.audited, 0)
  assert.equal(verdict.violations, 0)
  assert.equal(verdict.errors.length, 1)
  assert.equal(verdict.errors[0].stage, 'axe')
  assert.equal(verdict.notRun.length, 5)
  assert.deepEqual(verdict.stale, [])
  assert.deepEqual(h.visited, ['a'])
  assert.equal(h.report.errors[0].kind, 'batch-timeout')
  assert.equal(closes, 1)
  late({ dark: false, found: [] })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(
    summarizeAudit(h.report).audited,
    0,
    'late resolution cannot count as a passed audit',
  )
  assert.deepEqual(h.visited, ['a'], 'no work is dispatched after the timeout')
})

test('batch budgets reset, but the catalogue deadline includes work before the runner', async () => {
  const h = harness()
  h.report.policy.batchTimeoutMs = 25
  await runAuditCatalogue(h.report, h.openBatch, h.options)
  assert.equal(summarizeAudit(h.report).passed, true)
  const expired = harness()
  expired.tick(500)
  await runAuditCatalogue(expired.report, expired.openBatch, { ...expired.options, started: 0 })
  assert.equal(expired.report.errors[0].kind, 'catalogue-timeout')
  assert.equal(summarizeAudit(expired.report).notRun.length, 6)
  assert.deepEqual(expired.visited, [])
})

test('success observed at the deadline is not accepted, even before a timer callback', async () => {
  const h = harness(['late'])
  await runAuditCatalogue(
    h.report,
    async () => ({
      close: async () => {},
      audit: async () => {
        h.tick(100)
        return { dark: false, found: [] }
      },
    }),
    h.options,
  )
  assert.equal(summarizeAudit(h.report).passed, false)
  assert.equal(summarizeAudit(h.report).audited, 0)
  assert.equal(h.report.batches[0].status, 'timed-out')
})

test('the catalogue budget still cuts off later batches instead of resetting with them', async () => {
  const h = harness()
  h.report.policy.catalogueTimeoutMs = 45
  await runAuditCatalogue(h.report, h.openBatch, h.options)
  assert.equal(summarizeAudit(h.report).audited, 4)
  assert.equal(summarizeAudit(h.report).notRun.length, 1)
  assert.equal(h.report.errors[0].kind, 'catalogue-timeout')
})

test('cleanup failure makes an otherwise audited catalogue fail', async () => {
  const h = harness(['clean'])
  await runAuditCatalogue(
    h.report,
    async () => ({
      audit: async () => ({ dark: false, found: [] }),
      close: async () => {
        throw new Error('could not close page')
      },
    }),
    h.options,
  )
  assert.equal(summarizeAudit(h.report).passed, false)
  assert.equal(h.report.errors[0].help, 'could not close page')
})

test('cancellation preserves unvisited cases and dispatches no further stories', async () => {
  const controller = new AbortController()
  const h = harness(['cancelled', 'untouched'], { signal: controller.signal })
  await runAuditCatalogue(
    h.report,
    async () => ({
      close: async () => {},
      audit: async () => {
        queueMicrotask(() => controller.abort())
        return new Promise(() => {})
      },
    }),
    h.options,
  )
  assert.equal(h.report.batches[0].status, 'cancelled')
  assert.equal(summarizeAudit(h.report).notRun.length, 3)
  assert.equal(summarizeAudit(h.report).violations, 0)
})

test('bad scheme/result and setup failures cannot masquerade as zero findings', async () => {
  for (const result of [{ dark: true, found: [] }, { dark: false }, { dark: false, found: [{}] }]) {
    const h = harness(['bad'])
    await runAuditCatalogue(
      h.report,
      async () => ({ close: async () => {}, audit: async () => result }),
      h.options,
    )
    assert.equal(summarizeAudit(h.report).passed, false)
  }
  const h = harness(['bad'])
  await runAuditCatalogue(
    h.report,
    async () => {
      throw new Error('browser closed')
    },
    h.options,
  )
  assert.equal(summarizeAudit(h.report).notRun.length, 2)
  assert.equal(h.report.errors[0].help, 'browser closed')
})

test('KNOWN suppressions apply only to findings, and absent ones fail a complete traversal', async () => {
  const h = harness(['clean'])
  await runAuditCatalogue(h.report, h.openBatch, h.options)
  assert.equal(summarizeAudit(h.report, { 'old-rule': 123 }).passed, false)
  assert.deepEqual(summarizeAudit(h.report, { 'old-rule': 123 }).stale, [['old-rule', 123]])
})

test('empty/duplicate story denominators and invalid budgets are rejected', () => {
  assert.throws(() => createAuditReport([]), /nonempty catalogue/)
  assert.throws(() => createAuditReport(['a', 'a']), /distinct story/)
  assert.throws(() => createAuditReport(['a'], { ...policy, batchSize: 0 }), /Invalid audit budget/)
  assert.throws(() => createAuditReport(['a'], { batchSize: 1 }), /Invalid audit budget/)
})
