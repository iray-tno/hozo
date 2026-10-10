import {
  FONT_ANALYSIS_POLICY,
  REQUIRED_CONTEXT_POLICY,
  validateFontAvailability,
} from '@hozo/compiler/analysis'
import { escapeMarkdown } from './evidence.mjs'

// Compare compiler records, not a second lowering pipeline or emitted-code scan.
const journals = ['reactNativeImports', 'reactNativeReferences', 'reactNativeValues']
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const stable = (value) =>
  JSON.stringify(value, (_key, item) =>
    object(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  )
const equal = (a, b) => stable(a) === stable(b)
const sorted = (items) => [...items].sort((a, b) => stable(a).localeCompare(stable(b)))
const resolutionKey = (edge) => stable([edge.platform, edge.importer, edge.specifier])
const validEdge = (edge) =>
  object(edge) &&
  ['web', 'ios', 'android'].includes(edge.platform) &&
  typeof edge.importer === 'string' &&
  typeof edge.specifier === 'string' &&
  ['resolved', 'unresolved'].includes(edge.status) &&
  (edge.resolved === undefined || typeof edge.resolved === 'string')

export function validateBaseline(report) {
  if (!object(report) || !Number.isInteger(report.schemaVersion) || report.schemaVersion < 1)
    throw new Error('expected a migration-audit JSON report with schemaVersion')
  // A valid different version is non-comparable, not permission to invent fields.
  if (report.schemaVersion !== 3) return report
  if (
    !object(report.corpus) ||
    typeof report.corpus.repository !== 'string' ||
    !object(report.analysis) ||
    !Array.isArray(report.files) ||
    !Array.isArray(report.findings)
  )
    throw new Error('schema 3 requires corpus, analysis, files and findings')
  const a = report.analysis
  if (a.requiredContextPolicy !== undefined && typeof a.requiredContextPolicy !== 'string')
    throw new Error('invalid schema 3 requiredContextPolicy')
  if (a.fontAnalysisPolicy !== undefined && typeof a.fontAnalysisPolicy !== 'string')
    throw new Error('invalid schema 3 fontAnalysisPolicy')
  if (a.fontAnalysisPolicy === FONT_ANALYSIS_POLICY) {
    const fonts = a.projectFacts?.fonts
    if (!object(fonts) || !['resolved', 'unresolved'].includes(fonts.status))
      throw new Error('invalid schema 3 font facts')
    if (fonts.status === 'resolved') validateFontAvailability(fonts.value)
    else if (typeof fonts.reason !== 'string') throw new Error('invalid schema 3 unresolved fonts')
  }
  if (
    a.graphResolutions !== undefined &&
    (!Array.isArray(a.graphResolutions) || a.graphResolutions.some((edge) => !validEdge(edge)))
  )
    throw new Error('invalid schema 3 graphResolutions')
  if (
    a.primitiveSources !== undefined &&
    (!Array.isArray(a.primitiveSources) ||
      a.primitiveSources.some((item) => typeof item !== 'string'))
  )
    throw new Error('invalid schema 3 primitiveSources')
  if (
    report.corpus.sourceDirectories !== undefined &&
    (!Array.isArray(report.corpus.sourceDirectories) ||
      report.corpus.sourceDirectories.some((item) => typeof item !== 'string'))
  )
    throw new Error('invalid schema 3 sourceDirectories')
  for (const key of ['stylesheetInputs', 'configurationInputs', 'contextModules', 'fontInputs']) {
    if (
      a[key] !== undefined &&
      (!Array.isArray(a[key]) ||
        a[key].some(
          (item) =>
            !object(item) || typeof item.file !== 'string' || typeof item.sha256 !== 'string',
        ))
    )
      throw new Error(`invalid schema 3 ${key}`)
  }
  for (const key of ['sourceSelection', 'compilerAssumptions', 'preflightBasis', 'projectFacts']) {
    if (a[key] !== undefined && !object(a[key])) throw new Error(`invalid schema 3 ${key}`)
  }
  const files = new Set()
  for (const file of report.files) {
    if (
      !object(file) ||
      typeof file.file !== 'string' ||
      !file.file ||
      files.has(file.file) ||
      typeof file.sourceSha256 !== 'string' ||
      !object(file.targets) ||
      !Array.isArray(file.stages)
    )
      throw new Error('invalid or duplicate schema 3 file record')
    if (
      file.stages.some(
        (stage) => !object(stage) || !['completed', 'failed'].includes(stage.status),
      ) ||
      Object.entries(file.targets).some(
        ([backend, target]) =>
          !['web', 'native'].includes(backend) ||
          !object(target) ||
          !['completed', 'failed'].includes(target.status) ||
          typeof target.mode !== 'string',
      )
    )
      throw new Error('invalid schema 3 stage/target record')
    const usage = file.reactNativeUsage
    for (const target of Object.values(file.targets)) {
      const evidence = target.stylexContext
      if (evidence === undefined) continue
      if (
        !object(evidence) ||
        typeof evidence.policy !== 'string' ||
        !['web', 'ios', 'android'].includes(evidence.platform) ||
        typeof evidence.sourceSha256 !== 'string' ||
        typeof evidence.evidence !== 'string' ||
        !['not-required', 'complete', 'unresolved'].includes(evidence.status) ||
        !Array.isArray(evidence.modules) ||
        evidence.modules.some(
          (entry) =>
            !object(entry) || typeof entry.file !== 'string' || typeof entry.sha256 !== 'string',
        ) ||
        !Array.isArray(evidence.edges) ||
        evidence.edges.some((edge) => !validEdge(edge)) ||
        !Array.isArray(evidence.issues) ||
        evidence.issues.some((issue) => typeof issue !== 'string')
      )
        throw new Error('invalid schema 3 StyleX context evidence')
    }
    if (
      usage !== undefined &&
      (!object(usage) ||
        !Array.isArray(usage.bindings) ||
        usage.bindings.some((binding) => !object(binding) || !Array.isArray(binding.references)))
    )
      throw new Error('invalid schema 3 RN usage record')
    for (const name of journals) {
      const journal = file.targets.web?.[name]
      if (
        journal !== undefined &&
        (!object(journal) ||
          !Array.isArray(journal.outcomes) ||
          journal.outcomes.some(
            (outcome) =>
              !object(outcome) ||
              !Number.isInteger(outcome.bindingIndex) ||
              (name !== 'reactNativeImports' && !Number.isInteger(outcome.referenceIndex)) ||
              typeof outcome.disposition !== 'string',
          ))
      )
        throw new Error(`invalid schema 3 ${name} journal`)
    }
    files.add(file.file)
  }
  for (const finding of report.findings) {
    if (
      !object(finding) ||
      !files.has(finding.file) ||
      !['source', 'web', 'native'].includes(finding.backend) ||
      ['code', 'severity', 'message', 'stage'].some((key) => typeof finding[key] !== 'string') ||
      !object(finding.location) ||
      !['authored', 'unmapped', 'file'].includes(finding.location.status) ||
      (finding.subject !== undefined &&
        (!object(finding.subject) || typeof finding.subject.snippet !== 'string'))
    )
      throw new Error('invalid schema 3 finding record')
    if (
      finding.location.status === 'authored' &&
      ['spanStart', 'spanEnd', 'line', 'column'].some(
        (key) => !Number.isInteger(finding.location[key]),
      )
    )
      throw new Error('invalid schema 3 authored finding location')
  }
  return report
}

const provenance = (report) => ({
  schemaVersion: report.schemaVersion,
  corpus: report.corpus,
  toolchain: report.toolchain,
})

function context(report) {
  const a = report.analysis
  // Graph sizes and scan usesTailwind are observations, not settings. Effective
  // preflight IS a setting. Hashes distinguish equal-sized themes/alias graphs.
  return {
    directories: sorted(report.corpus.sourceDirectories ?? []),
    selection: a.sourceSelection,
    nativePlatform: a.nativePlatform,
    resolutionPolicy: a.resolutionPolicy,
    parserMode: a.parserMode,
    requiredContextPolicy: a.requiredContextPolicy,
    fontAnalysisPolicy: a.fontAnalysisPolicy,
    fontFacts: a.fontAnalysisPolicy === undefined ? undefined : a.projectFacts?.fonts,
    fontInputs: a.fontAnalysisPolicy === undefined ? undefined : sorted(a.fontInputs ?? []),
    assumptions: a.compilerAssumptions,
    preflightRequested: a.preflightBasis?.requested,
    primitiveSources: sorted(a.primitiveSources ?? []),
    stylesheets: sorted(a.stylesheetInputs ?? []),
    configuration: sorted(a.configurationInputs ?? []),
    contextModules: sorted(a.contextModules ?? []),
  }
}

function contextComplete(report) {
  const a = report.analysis
  return (
    report.corpus.sourceDirectories?.length > 0 &&
    a.sourceSelection !== undefined &&
    a.nativePlatform !== undefined &&
    a.resolutionPolicy !== undefined &&
    a.parserMode !== undefined &&
    a.compilerAssumptions !== undefined &&
    a.preflightBasis !== undefined &&
    Array.isArray(a.primitiveSources) &&
    Array.isArray(a.stylesheetInputs) &&
    Array.isArray(a.configurationInputs) &&
    Array.isArray(a.contextModules) &&
    a.projectFacts !== undefined &&
    a.contextStatus === 'prepared' &&
    (a.fontAnalysisPolicy === undefined ||
      (a.fontAnalysisPolicy === FONT_ANALYSIS_POLICY &&
        Array.isArray(a.fontInputs) &&
        (a.projectFacts?.fonts?.status === 'resolved' ||
          (a.projectFacts?.fonts?.status === 'unresolved' && a.fontInputs.length === 0)))) &&
    ['absent', 'resolved'].includes(a.projectFacts.css?.status) &&
    ['defaulted', 'resolved'].includes(a.projectFacts.theme?.status) &&
    (a.requiredContextPolicy === REQUIRED_CONTEXT_POLICY
      ? a.projectFacts.stylexGraph?.status === 'resolved' && Array.isArray(a.graphResolutions)
      : a.requiredContextPolicy === undefined &&
        ['absent', 'resolved'].includes(a.projectFacts.aliases?.status) &&
        a.projectFacts.stylexGraph?.value?.unresolvedImports === 0)
  )
}

function complete(file) {
  return (
    file.bindingsStatus === 'completed' &&
    Object.keys(file.targets).length > 0 &&
    file.stages.every((stage) => stage.status === 'completed') &&
    Object.values(file.targets).every((target) => target.status === 'completed')
  )
}

function contextIndex(report) {
  const hashes = new Map()
  for (const entry of [
    ...report.files.map((file) => ({ file: file.file, sha256: file.sourceSha256 })),
    ...(report.analysis.contextModules ?? []),
  ]) {
    // Conflicting recorded hashes cannot certify either copy as the prepared input.
    hashes.set(
      entry.file,
      hashes.has(entry.file) && hashes.get(entry.file) !== entry.sha256 ? null : entry.sha256,
    )
  }
  const edges = new Map()
  for (const edge of report.analysis.graphResolutions ?? []) {
    const key = resolutionKey(edge)
    const previous = edges.get(key)
    edges.set(key, edges.has(key) && !equal(previous, edge) ? null : edge)
  }
  return { hashes, edges }
}

function fileContextComplete(report, file, index) {
  if (report.analysis.requiredContextPolicy !== REQUIRED_CONTEXT_POLICY) return true
  return Object.values(file.targets).every((target) => {
    const context = target.stylexContext
    if (
      !context ||
      context.policy !== REQUIRED_CONTEXT_POLICY ||
      context.evidence !== 'module-import-bindings-and-conservative-references' ||
      context.sourceSha256 !== file.sourceSha256 ||
      context.platform !== target.platform ||
      context.issues.length !== 0
    )
      return false
    if (context.status === 'not-required')
      return context.modules.length === 0 && context.edges.length === 0
    const modules = new Map(context.modules.map((entry) => [entry.file, entry.sha256]))
    return (
      context.status === 'complete' &&
      modules.size === context.modules.length &&
      modules.get(file.file) === file.sourceSha256 &&
      context.modules.every((entry) => index.hashes.get(entry.file) === entry.sha256) &&
      context.edges.every(
        (edge) =>
          edge.status === 'resolved' &&
          typeof edge.resolved === 'string' &&
          edge.platform === target.platform &&
          modules.has(edge.importer) &&
          modules.has(edge.resolved) &&
          index.edges.get(resolutionKey(edge))?.status === 'resolved' &&
          index.edges.get(resolutionKey(edge))?.resolved === edge.resolved,
      )
    )
  })
}

function dependencyContextChanged(before, after) {
  return Object.entries(after.targets).some(([backend, target]) => {
    const left = before.targets[backend]?.stylexContext
    const right = target.stylexContext
    if (left?.status !== 'complete' || right?.status !== 'complete') return false
    const inputs = (context, root) => ({
      modules: sorted(context.modules.filter((entry) => entry.file !== root)),
      edges: sorted(
        context.edges.map(({ platform, importer, specifier, resolved }) => ({
          platform,
          importer,
          specifier,
          resolved,
        })),
      ),
    })
    return !equal(inputs(left, before.file), inputs(right, after.file))
  })
}

const targetContract = (file) =>
  Object.fromEntries(
    Object.entries(file.targets).map(([backend, target]) => [
      backend,
      { mode: target.mode, platform: target.platform, eligibility: target.integrationEligibility },
    ]),
  )

function anchor(finding) {
  // External fingerprints are not trusted unique IDs. Stage/coordinates are
  // attribution/display data; subject snippets were normalized by the compiler.
  return stable([
    finding.backend,
    finding.code,
    hasAnchor(finding) ? finding.subject : { kind: 'no-authored-subject' },
  ])
}

function hasAnchor(finding) {
  return (
    finding.location.status === 'authored' &&
    finding.subject?.kind === 'diagnostic-span' &&
    finding.subject.snippet.trim().length > 0
  )
}

function group(items) {
  const groups = new Map()
  for (const item of items) {
    const key = anchor(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

function boundary(file) {
  const web = file.targets.web
  if (!web) return { status: 'not-applicable' }
  if (!complete(file) || file.reactNativeUsage?.status !== 'completed')
    return { status: 'not-assessed', reason: 'Binding or target analysis incomplete.' }
  const channels = {}
  for (const name of journals) {
    const journal = web[name]
    if (journal?.status !== 'completed' || !Array.isArray(journal.outcomes))
      return { status: 'not-assessed', reason: `${name} missing or incomplete.` }
    const counts = new Map()
    for (const outcome of journal.outcomes) {
      const binding = file.reactNativeUsage.bindings[outcome.bindingIndex]
      const reference = binding?.references[outcome.referenceIndex]
      if (!binding || (name !== 'reactNativeImports' && !reference))
        return { status: 'not-assessed', reason: 'Journal cannot join to authored usage.' }
      // File-level counts, not matched cross-edit references. Unknown/type
      // outcomes stay categories, never inferred support or dependency survival.
      const key = stable({
        imported: binding.imported,
        kind: binding.kind,
        typeOnly: binding.typeOnly,
        member: reference?.member,
        access: reference?.access,
        referenceKind: reference?.kind,
        disposition: outcome.disposition,
        replacement: outcome.replacement,
        sourceEvidence: outcome.sourceEvidence,
      })
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const { outcomes: _outcomes, ...contract } = journal
    // Review prose/evidence belongs to member guidance, not to a rewrite
    // boundary. Renaming a review file must not imply an import moved again.
    delete contract.unmappedDecisions
    delete contract.unmappedTags
    delete contract.typeReferencesExcluded
    channels[name] = {
      contract,
      counts: [...counts].sort(([a], [b]) => a.localeCompare(b)),
      unmapped: journal.unmappedDecisions ?? journal.unmappedTags ?? 0,
      typeReferencesExcluded: journal.typeReferencesExcluded ?? 0,
    }
  }
  return { status: 'assessed', channels }
}

export function compareReports(current, baseline) {
  validateBaseline(current)
  validateBaseline(baseline)
  const result = {
    version: 1,
    status: 'comparable',
    reasons: [],
    baseline: provenance(baseline),
    provenanceChanges: [],
    files: { added: [], removed: [], sourceChanged: [], targetChanged: [], notAssessed: [] },
    findings: { added: [], resolved: [], changed: [], continued: [], notAssessed: [] },
    rewriteBoundaries: { changed: [], continued: [], notApplicable: [], notAssessed: [] },
    limitations:
      'Observation comparison only: no causal attribution, dependency-removal or runtime verdict. Removed files are not resolved findings. Duplicate/possible moved occurrences remain unassessed.',
  }
  for (const field of ['corpus', 'toolchain']) {
    const before = provenance(baseline)[field]
    const after = provenance(current)[field]
    const identity = (value) => {
      const copy = structuredClone(value)
      if (field === 'toolchain' && copy?.binding) {
        delete copy.binding.path
        if (/^(?:[a-z]:[/\\]|\/)/i.test(copy.binding.specifier ?? '')) delete copy.binding.specifier
      }
      return copy
    }
    if (!equal(identity(before), identity(after)))
      result.provenanceChanges.push({ field, before, after })
  }
  if (baseline.schemaVersion !== 3 || current.schemaVersion !== 3) {
    result.status = 'not-comparable'
    result.reasons.push(
      'Only schema 3 evidence can be compared; no schema inference was attempted.',
    )
    return result
  }
  const beforeFiles = new Map(baseline.files.map((file) => [file.file, file]))
  const afterFiles = new Map(current.files.map((file) => [file.file, file]))
  result.files.added = [...afterFiles.keys()].filter((file) => !beforeFiles.has(file)).sort()
  result.files.removed = [...beforeFiles.keys()].filter((file) => !afterFiles.has(file)).sort()
  for (const [file, before] of beforeFiles) {
    const after = afterFiles.get(file)
    if (!after) continue
    if (before.sourceSha256 !== after.sourceSha256) result.files.sourceChanged.push(file)
    if (!equal(targetContract(before), targetContract(after))) result.files.targetChanged.push(file)
  }
  const targetChanged = new Set(result.files.targetChanged)
  if (current.corpus.repository !== baseline.corpus.repository) {
    result.status = 'not-comparable'
    result.reasons.push(
      'Repository identities differ; supply the same --repository for relocated checkouts.',
    )
  }
  result.context = {
    before: context(baseline),
    after: context(current),
    projectFacts: { before: baseline.analysis.projectFacts, after: current.analysis.projectFacts },
  }
  if (!equal(result.context.before, result.context.after)) {
    result.status = 'not-comparable'
    result.reasons.push('Source selection or effective configuration/context inputs differ.')
  }
  if (!contextComplete(current) || !contextComplete(baseline)) {
    if (result.status !== 'not-comparable') result.status = 'partial'
    result.reasons.push('Project context is incomplete or lacks comparison evidence.')
  }
  const usableContext = result.status === 'comparable'
  const beforeContext = contextIndex(baseline)
  const afterContext = contextIndex(current)
  const baselineGroups = group(baseline.findings)
  const currentGroups = group(current.findings)
  const findingsByFile = (report) => {
    const map = new Map()
    for (const finding of report.findings) {
      if (!map.has(finding.file)) map.set(finding.file, [])
      map.get(finding.file).push(finding)
    }
    return map
  }
  const beforeFindings = findingsByFile(baseline)
  const afterFindings = findingsByFile(current)
  const unknown = (before, after, reason) => {
    result.findings.notAssessed.push({ before, after, reason })
    if (result.status === 'comparable') result.status = 'partial'
  }
  for (const file of [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].sort()) {
    const before = beforeFiles.get(file)
    const after = afterFiles.get(file)
    const old = beforeFindings.get(file) ?? []
    const now = afterFindings.get(file) ?? []
    const reason = !usableContext
      ? 'Project context or comparison settings do not permit finding verdicts.'
      : !after
        ? 'File left the authored inventory; its findings were not proven resolved.'
        : !complete(after) || (before && !complete(before))
          ? 'File analysis incomplete; missing diagnostics are not resolution evidence.'
          : !fileContextComplete(current, after, afterContext) ||
              (before && !fileContextComplete(baseline, before, beforeContext))
            ? 'Required compiler context is incomplete or lacks matching file/target evidence.'
            : before && targetChanged.has(file)
              ? 'Target set, mode, platform or integration eligibility changed.'
              : before && dependencyContextChanged(before, after)
                ? 'Required dependency inputs or resolver-owned bindings changed.'
                : undefined
    if (reason) {
      result.files.notAssessed.push({ file, reason })
      if (before && after && !before.targets.web && !after.targets.web)
        result.rewriteBoundaries.notApplicable.push(file)
      else result.rewriteBoundaries.notAssessed.push({ file, reason })
      for (const finding of old) unknown(finding, undefined, reason)
      for (const finding of now) unknown(undefined, finding, reason)
      if (result.status === 'comparable') result.status = 'partial'
      continue
    }
    const previous = group(old)
    const next = group(now)
    for (const key of new Set([...previous.keys(), ...next.keys()])) {
      const left = previous.get(key) ?? []
      const right = next.get(key) ?? []
      if (left.length === 1 && right.length === 1) {
        const a = left[0]
        const b = right[0]
        if (!hasAnchor(a) && before.sourceSha256 !== after.sourceSha256)
          unknown(a, b, 'Changed source has no authored subject anchor.')
        else if (a.message !== b.message || a.severity !== b.severity)
          result.findings.changed.push({
            before: a,
            after: b,
            confidence: hasAnchor(a) ? 'same-subject' : 'unchanged-source-and-unique-code',
          })
        else
          result.findings.continued.push({
            before: a,
            after: b,
            confidence: hasAnchor(a) ? 'same-subject' : 'unchanged-source-and-unique-code',
          })
      } else if (left.length > 1 || right.length > 1) {
        // Exact duplicate positions carry identity only with unchanged source.
        if (before?.sourceSha256 === after.sourceSha256 && equal(left, right)) {
          for (let index = 0; index < left.length; index += 1)
            result.findings.continued.push({
              before: left[index],
              after: right[index],
              confidence: 'unchanged-source-and-records',
            })
        } else {
          for (const finding of left)
            unknown(finding, undefined, 'Duplicate subject; occurrence identity is ambiguous.')
          for (const finding of right)
            unknown(undefined, finding, 'Duplicate subject; occurrence identity is ambiguous.')
        }
      } else {
        const item = left[0] ?? right[0]
        const other = (left.length ? currentGroups : baselineGroups).get(key) ?? []
        const sameFile = left.length ? now : old
        if (
          sameFile.some(
            (candidate) =>
              candidate.backend === item.backend &&
              candidate.code === item.code &&
              candidate.message === item.message &&
              (!hasAnchor(candidate) || !hasAnchor(item)),
          )
        )
          unknown(left[0], right[0], 'Authored-anchor confidence changed; no new/resolved verdict.')
        else if (other.some((candidate) => candidate.file !== file))
          unknown(
            left[0],
            right[0],
            'Similar subject in another file; possible move/clone is not resolved.',
          )
        else if (!hasAnchor(item) && before?.sourceSha256 !== after.sourceSha256)
          unknown(left[0], right[0], 'No authored subject anchor in changed source.')
        else if (left.length) result.findings.resolved.push({ before: item })
        else result.findings.added.push({ after: item })
      }
    }
    if (!before) {
      result.rewriteBoundaries.notAssessed.push({
        file,
        reason: 'Added file has no baseline boundary.',
      })
      continue
    }
    const a = boundary(before)
    const b = boundary(after)
    if (a.status === 'not-applicable' && b.status === 'not-applicable') {
      result.rewriteBoundaries.notApplicable.push(file)
    } else if (a.status === 'not-assessed' || b.status === 'not-assessed') {
      result.rewriteBoundaries.notAssessed.push({ file, before: a, after: b })
      if (result.status === 'comparable') result.status = 'partial'
    } else if (
      !equal(
        Object.fromEntries(
          Object.entries(a.channels ?? {}).map(([name, channel]) => [name, channel.contract]),
        ),
        Object.fromEntries(
          Object.entries(b.channels ?? {}).map(([name, channel]) => [name, channel.contract]),
        ),
      )
    ) {
      result.rewriteBoundaries.notAssessed.push({
        file,
        before: a,
        after: b,
        reason: 'Journal contracts differ.',
      })
      if (result.status === 'comparable') result.status = 'partial'
    } else if (equal(a, b)) result.rewriteBoundaries.continued.push(file)
    else result.rewriteBoundaries.changed.push({ file, before: a, after: b })
  }
  return result
}

export function comparisonMarkdown(comparison, { details = false } = {}) {
  if (!comparison) return ''
  const shown = (items) => (details ? items : items.slice(0, 12))
  const rows = Object.entries(comparison.findings)
    .map(([name, items]) => `| Findings: ${name} | ${items.length} |`)
    .concat(
      Object.entries(comparison.files).map(
        ([name, items]) => `| Files: ${name} | ${items.length} |`,
      ),
      Object.entries(comparison.rewriteBoundaries).map(
        ([name, items]) => `| Web boundaries: ${name} | ${items.length} |`,
      ),
    )
  const entries = Object.entries(comparison.findings).flatMap(([category, items]) =>
    shown(items).map(({ before, after, reason, confidence }) => {
      const finding = after ?? before
      const position = (item) =>
        item?.location.status === 'authored'
          ? `${item.location.line}:${item.location.column}`
          : item
            ? item.location.status
            : '—'
      return `| ${category} | ${escapeMarkdown(finding.file)} | ${finding.backend} / ${escapeMarkdown(finding.code)} | ${position(before)} → ${position(after)} | ${escapeMarkdown(reason ?? confidence ?? 'Observed occurrence difference')} |`
    }),
  )
  return `## Baseline comparison

Status: **${comparison.status}**. ${comparison.limitations}

${comparison.reasons.map((reason) => `- ${escapeMarkdown(reason)}`).join('\n')}

| Observation | Count |
|---|---:|
${rows.join('\n')}

| Finding outcome | Authored file | Backend / code | Before → after location | Evidence / limitation |
|---|---|---|---|---|
${entries.join('\n') || '| No finding differences | — | — | — | — |'}

${details ? 'All finding outcomes are shown.' : 'At most 12 records per category are shown; --details expands all. JSON retains every record.'}

Added files: ${shown(comparison.files.added).map(escapeMarkdown).join(', ') || 'none'}. Removed files: ${shown(comparison.files.removed).map(escapeMarkdown).join(', ') || 'none'}. Source-changed files: ${shown(comparison.files.sourceChanged).map(escapeMarkdown).join(', ') || 'none'}. Lists follow the same display limit; JSON retains target changes and per-file limitations too.

Changed Web boundary files: ${
    shown(comparison.rewriteBoundaries.changed)
      .map(({ file }) => escapeMarkdown(file))
      .join(', ') || 'none'
  }. JSON retains before/after category counts, unknowns and journal contracts. These are file-level counts, not matched runtime references or an improvement score.

Baseline commit: ${escapeMarkdown(comparison.baseline.corpus?.commit ?? 'not recorded')}. Provenance differences: ${comparison.provenanceChanges.map(({ field }) => field).join(', ') || 'none'}. JSON retains both observations; source, configuration and tool changes are not causally attributed. Identical findings in edited files and missing/unmapped anchors remain unassessed, not silently resolved.

`
}
