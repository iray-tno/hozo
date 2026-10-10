import { escapeMarkdown } from './evidence.mjs'

const MODES = ['none', 'error', 'new-errors']

// Consume the compiler's findings and the comparator's verdicts, not headline
// samples or another diagnostic detector. A failed observation is never a clean
// CI result, even when the caller has opted out of diagnostic failure policies.
export function evaluateFailurePolicy(report, mode = 'none') {
  if (!MODES.includes(mode)) throw new TypeError(`Unknown failure policy: ${mode}`)
  const errorFindings = []
  const analysisFailures = []
  report.findings.forEach((finding, index) => {
    if (finding.severity === 'error') errorFindings.push(index)
    if (finding.code === 'ANALYSIS_FAILED') analysisFailures.push(index)
  })
  // Syntax rejection is an authored error, not a crashed compiler. Its failed
  // target records follow the compiler's early-return path. Other failed
  // observations must not pass merely because they supplied no error finding.
  const syntaxFiles = new Set(
    report.findings.filter((finding) => finding.code === 'SOURCE_SYNTAX_ERROR').map((f) => f.file),
  )
  const incompleteFiles = report.files
    .filter(
      (file) =>
        !syntaxFiles.has(file.file) &&
        (file.bindingsStatus === 'failed' ||
          file.reactNativeUsage?.status === 'failed' ||
          file.stages.some((stage) => stage.status === 'failed') ||
          Object.values(file.targets).some((target) => target.status === 'failed')),
    )
    .map((file) => file.file)
  const result = {
    version: 1,
    mode,
    status: 'passed',
    exitCode: 0,
    currentErrors: errorFindings.length,
    errorFindings,
    analysisFailures,
    incompleteFiles,
    newErrors: null,
    newErrorFindings: null,
    reasons: [],
    limitations:
      'Static finding policy only, not migration readiness, complete compatibility, production dependency removal or runtime correctness. Unknowns remain in the report.',
  }
  if (analysisFailures.length) {
    result.status = 'failed'
    result.reasons.push(`${analysisFailures.length} compiler analysis failure(s).`)
  }
  if (incompleteFiles.length) {
    result.status = 'failed'
    result.reasons.push(`Incomplete compiler analysis in ${incompleteFiles.length} file(s).`)
  }
  if (mode === 'error' && errorFindings.length) {
    result.status = 'failed'
    result.reasons.push(`${errorFindings.length} current error finding(s).`)
  }
  if (mode === 'new-errors') {
    const comparison = report.comparison
    if (comparison?.status !== 'comparable') {
      if (result.status !== 'failed') result.status = 'blocked'
      result.reasons.push(
        `new-errors requires a comparable baseline; comparison is ${comparison?.status ?? 'missing'}.`,
      )
      result.reasons.push(...(comparison?.reasons ?? []))
    } else {
      result.newErrorFindings = []
      comparison.findings.added.forEach(({ after }, index) => {
        if (after.severity === 'error') result.newErrorFindings.push({ category: 'added', index })
      })
      comparison.findings.changed.forEach(({ before, after }, index) => {
        if (after.severity === 'error' && before.severity !== 'error')
          result.newErrorFindings.push({ category: 'changed', index })
      })
      result.newErrors = result.newErrorFindings.length
      if (result.newErrors) {
        result.status = 'failed'
        result.reasons.push(`${result.newErrors} added or severity-escalated error finding(s).`)
      }
    }
  }
  result.exitCode = result.status === 'passed' ? 0 : 1
  return result
}

export function failurePolicyMarkdown(policy) {
  return `## CI failure policy

| | Result |
|---|---|
| Mode | ${policy.mode} |
| Status / exit code | ${policy.status} / ${policy.exitCode} |
| Current error findings | ${policy.currentErrors} |
| Compiler analysis failures | ${policy.analysisFailures.length} |
| Incomplete file analyses (excluding source syntax rejection) | ${policy.incompleteFiles.length} |
| Added or severity-escalated errors | ${policy.newErrors ?? 'not assessed'} |

${policy.reasons.length ? policy.reasons.map((reason) => `- ${escapeMarkdown(reason)}`).join('\n') : 'The selected static finding policy passed.'}

${policy.limitations}

Finding indices in JSON reference the complete current findings or comparison added/changed arrays, never capped samples. A blocked comparison is not zero new errors.
`
}
