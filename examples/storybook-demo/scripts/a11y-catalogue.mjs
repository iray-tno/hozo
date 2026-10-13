// One browser/page at a time. A catalogue's growth must not silently turn
// unvisited stories into axe violations, or an incomplete traversal green.
export const AUDIT_POLICY = {
  batchSize: 32,
  batchTimeoutMs: 4 * 60 * 1000,
  catalogueTimeoutMs: 8 * 60 * 1000,
}

export function createAuditReport(ids, policy = AUDIT_POLICY) {
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string' || !id)
  )
    throw new Error('Accessibility audit requires a nonempty catalogue of distinct story ids')
  for (const key of Object.keys(AUDIT_POLICY)) {
    const value = policy[key]
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid audit budget')
  }
  return {
    version: 1,
    policy: { ...policy },
    cases: ['light', 'dark'].flatMap((scheme) =>
      ids.map((id) => ({ id, scheme, status: 'not-run' })),
    ),
    batches: [],
    errors: [],
  }
}

export async function runAuditCatalogue(
  report,
  openBatch,
  {
    now = () => performance.now(),
    started = now(),
    schedule = setTimeout,
    unschedule = clearTimeout,
    onBatch = () => {},
    signal,
  } = {},
) {
  const deadline = started + report.policy.catalogueTimeoutMs
  const plans = []
  for (const scheme of ['light', 'dark']) {
    const cases = report.cases.filter((entry) => entry.scheme === scheme)
    for (let index = 0; index < cases.length; index += report.policy.batchSize)
      plans.push({ scheme, cases: cases.slice(index, index + report.policy.batchSize) })
  }
  for (const plan of plans) {
    if (signal?.aborted) {
      report.errors.push({ kind: 'cancelled', help: 'Catalogue audit cancelled' })
      break
    }
    if (now() >= deadline) {
      report.errors.push({ kind: 'catalogue-timeout', help: 'Catalogue budget exhausted' })
      break
    }
    const batchStarted = now()
    const batchDeadline = Math.min(deadline, batchStarted + report.policy.batchTimeoutMs)
    const batch = {
      index: report.batches.length + 1,
      scheme: plan.scheme,
      expected: plan.cases.length,
      status: 'running',
    }
    report.batches.push(batch)
    let session
    let closing
    let expired = false
    let active
    let caseStarted
    const close = () => {
      if (session && !closing) closing = Promise.resolve().then(() => session.close())
      return closing
    }
    const expire = (reason) => {
      if (expired) return
      expired = true
      const kind = reason ?? (batchDeadline === deadline ? 'catalogue-timeout' : 'batch-timeout')
      const help = `${kind}: batch ${batch.index} (${plan.scheme}) did not complete`
      batch.status = kind === 'cancelled' ? 'cancelled' : 'timed-out'
      report.errors.push({ kind, batch: batch.index, id: active?.id, stage: active?.stage, help })
      if (active)
        Object.assign(active, { status: 'error', error: help, elapsedMs: now() - caseStarted })
      // Closing cancels real Playwright work. The race settles immediately;
      // an audit that resolves late is neither counted nor followed by more work.
      void close()?.catch(() => {})
    }
    let timer
    let release
    const abort = () => {
      expire('cancelled')
      release?.()
    }
    try {
      await Promise.race([
        (async () => {
          try {
            session = await openBatch(plan.scheme)
            if (expired) return
            for (const entry of plan.cases) {
              if (expired || now() >= batchDeadline) {
                expire()
                break
              }
              active = entry
              caseStarted = now()
              entry.stage = 'navigation'
              try {
                const result = await session.audit(entry.id, (stage) => {
                  if (!expired) entry.stage = stage
                })
                if (expired || now() >= batchDeadline) {
                  expire()
                  break
                }
                if (result?.dark !== (plan.scheme === 'dark'))
                  throw new Error(`asked for ${plan.scheme}, page reports the opposite scheme`)
                if (
                  !Array.isArray(result.found) ||
                  result.found.some((item) => typeof item?.rule !== 'string')
                )
                  throw new Error('axe did not return a valid violation list')
                Object.assign(entry, {
                  status: 'audited',
                  violations: result.found,
                  elapsedMs: now() - caseStarted,
                })
              } catch (error) {
                if (expired || now() >= batchDeadline) {
                  expire()
                  break
                }
                Object.assign(entry, {
                  status: 'error',
                  error: error.message,
                  elapsedMs: now() - caseStarted,
                })
              }
              active = undefined
            }
          } catch (error) {
            if (!expired) {
              batch.status = 'error'
              report.errors.push({ kind: 'batch-error', batch: batch.index, help: error.message })
            }
          } finally {
            await close()
          }
        })(),
        new Promise((resolve) => {
          release = resolve
          signal?.addEventListener('abort', abort, { once: true })
          if (signal?.aborted) abort()
          timer = schedule(
            () => {
              expire()
              resolve()
            },
            Math.max(0, batchDeadline - now()),
          )
        }),
      ])
    } catch (error) {
      if (!expired) {
        batch.status = 'error'
        report.errors.push({ kind: 'batch-error', batch: batch.index, help: error.message })
      }
    } finally {
      unschedule(timer)
      signal?.removeEventListener('abort', abort)
    }
    if (!expired && now() >= batchDeadline) expire()
    batch.elapsedMs = now() - batchStarted
    batch.audited = plan.cases.filter((entry) => entry.status === 'audited').length
    if (batch.status === 'running') batch.status = 'completed'
    onBatch(batch)
    if (batch.status !== 'completed') break
  }
  report.elapsedMs = now() - started
  return report
}

export function summarizeAudit(report, known = {}) {
  const audited = report.cases.filter((entry) => entry.status === 'audited')
  const found = audited.flatMap((entry) =>
    entry.violations.map((violation) => ({ ...violation, id: entry.id, scheme: entry.scheme })),
  )
  const errors = report.cases.filter((entry) => entry.status === 'error')
  const notRun = report.cases.filter((entry) => entry.status === 'not-run')
  const complete = audited.length === report.cases.length && report.errors.length === 0
  const fresh = found.filter((violation) => !(violation.rule in known))
  const seen = new Set(found.map((violation) => violation.rule))
  // A rule absent from an incomplete audit may live in an unvisited story.
  const stale = complete ? Object.entries(known).filter(([rule]) => !seen.has(rule)) : []
  return {
    passed: complete && fresh.length === 0 && stale.length === 0,
    complete,
    expected: report.cases.length,
    audited: audited.length,
    violations: found.length,
    fresh,
    errors,
    notRun,
    stale,
  }
}
