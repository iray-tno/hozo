// The code half of `hozo square` (RFC 011 §5): the audit engine `hozo dry-fit`
// runs, pointed at a project that already uses Hozo. Its schema 3 report is
// embedded whole as `code.report`, so a CI step that reads a dry-fit report
// reads this one, and either can be the baseline for the other.
//
// Loaded only when the setup half is done: the audit loads the compiler's
// native addon, and a broken install must still get its setup report first.

import { readFileSync } from 'node:fs'
import path from 'node:path'

/** A baseline `square` cannot read; the caller reports it with exit 2. */
export class BaselineError extends Error {
  constructor(message) {
    super(message)
    this.code = 'invalid-baseline'
  }
}

/**
 * The audit report inside `file`: a `hozo square --format json` report (its
 * `code.report`) or a `hozo dry-fit` JSON report. Read before the setup half
 * runs, so a wrong path fails in a second, not after the whole audit.
 */
export function readBaseline(file) {
  let report
  try {
    report = JSON.parse(readFileSync(path.resolve(file), 'utf8'))
  } catch (error) {
    throw new BaselineError(`cannot read baseline ${file}: ${error.message.replace(/\s+/g, ' ')}`)
  }
  if (report && typeof report === 'object' && Array.isArray(report.setup) && 'code' in report) {
    if (!report.code?.report)
      throw new BaselineError(
        `baseline ${file} is a hozo square report whose code half did not run (${report.code?.reason ?? 'no reason given'})`,
      )
    return report.code.report
  }
  return report
}

/**
 * Run the audit on `project`. `failOn` is square's; the audit has no warning
 * level, so `warning` asks it for errors and counts the warnings here.
 */
export async function checkCode({ project, name, css, compiler, failOn, baseline }) {
  let audit
  try {
    audit = await import('@hozo/migration-audit')
  } catch (error) {
    return unable(
      `@hozo/migration-audit could not load: ${firstLine(error)}`,
      'compiler-unavailable',
    )
  }
  let validated
  if (baseline !== undefined)
    try {
      validated = audit.validateBaseline(baseline)
    } catch (error) {
      throw new BaselineError(`cannot compare baseline: ${firstLine(error)}`)
    }
  let report
  try {
    report = await audit.measureRealApp({ root: project, name, ...(css ? { css } : {}) })
  } catch (error) {
    if (error instanceof audit.AuditInputError)
      return unable(`The audit could not run: ${error.message}`, error.code)
    return unable(`The audit could not run: ${firstLine(error)}`, 'audit-failed')
  }
  if (validated) report.comparison = audit.compareReports(report, validated)
  const mode = failOn === 'none' || failOn === 'new-errors' ? failOn : 'error'
  report.failurePolicy = audit.evaluateFailurePolicy(report, mode)

  // The audit compiles with the compiler this CLI brings, which `npx` may
  // fetch at another version than the project builds with. Its findings
  // are then that compiler's, not the build's: said, not silently compared.
  const measuredWith = report.toolchain.compilerVersion
  const findings =
    compiler && measuredWith !== compiler.version
      ? [
          {
            code: 'compiler-version-mismatch',
            severity: 'warning',
            message: `Measured with @hozo/compiler ${measuredWith}, while the project builds with ${compiler.version} (${compiler.from}); a finding here may not be the build's`,
            fix: `Run the CLI at the project's version: npx @hozo/cli@${compiler.version} square`,
          },
        ]
      : []

  const { bySeverity } = report.diagnostics
  const errors = bySeverity.error ?? 0
  const warnings = bySeverity.warning ?? 0
  const reasons = [...report.failurePolicy.reasons]
  if (failOn === 'warning' && warnings)
    reasons.push(`${warnings} current warning finding${warnings === 1 ? '' : 's'}.`)
  if (failOn === 'warning' && findings.length)
    reasons.push(`Measured with another compiler than the project's.`)
  const files = report.scope.authoredFiles
  return {
    status:
      errors || warnings || findings.length || report.failurePolicy.status !== 'passed'
        ? 'failed'
        : 'passed',
    summary: `${files} file${files === 1 ? '' : 's'} on Web and Native: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}${
      report.comparison?.status === 'comparable'
        ? `; ${plural(report.failurePolicy.newErrors ?? newErrors(report.comparison), 'new error')} since the baseline`
        : report.comparison
          ? `; not comparable with the baseline (${report.comparison.status})`
          : ''
    }`,
    compiler: { measuredWith, project: compiler?.version ?? null },
    findings,
    report,
    // `blocked` (new-errors against a baseline the engine cannot fully
    // compare, as when a file was added) exits 1, as dry-fit does: a CI step
    // that cannot prove "no new errors" fails closed.
    exitCode: reasons.length ? 1 : 0,
    reasons,
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const firstLine = (error) => String(error?.message ?? error).split('\n')[0]

/** Added or escalated errors, when the policy did not count them itself. */
const newErrors = (comparison) =>
  comparison.findings.added.filter(({ after }) => after.severity === 'error').length +
  comparison.findings.changed.filter(
    ({ before, after }) => after.severity === 'error' && before.severity !== 'error',
  ).length

/** A code half that could not run: reported, and exit 2 (fix the install). */
const unable = (reason, code) => ({
  status: 'skipped',
  reason,
  exitCode: 2,
  reasons: [`The code half could not run [${code}].`],
})

/** The text report's Code section: the totals, then each finding where it is, errors first. */
export function codeLines(code) {
  if (code.status === 'skipped') return [`  skip  ${code.reason}`]
  const lines = [`  ${code.status === 'passed' ? 'pass' : 'FAIL'}  ${code.summary}`]
  for (const finding of code.findings) {
    lines.push(`        ${finding.severity.padEnd(7)} ${finding.message} [${finding.code}]`)
    lines.push(`                Fix: ${finding.fix}`)
  }
  const shown = ['error', 'warning'].flatMap((severity) =>
    code.report.findings.filter((finding) => finding.severity === severity),
  )
  for (const finding of shown.slice(0, SHOWN)) {
    const { location } = finding
    const where = location?.status === 'authored' ? `:${location.line}:${location.column}` : ''
    lines.push(
      `        ${finding.severity.padEnd(7)} ${finding.file}${where} (${finding.backend}) ${finding.message.split('\n')[0]} [${finding.code}]`,
    )
  }
  if (shown.length > SHOWN) lines.push(`        ... and ${shown.length - SHOWN} more`)
  if (code.report.findings.length)
    lines.push('        Every finding, with its evidence: --format json (code.report.findings)')
  return lines
}

const SHOWN = 20
